import { BadRequestException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';

import { PrismaService } from '../database/prisma.service';
import type { Prisma } from '../generated/prisma/client';
import { AccessTokenService } from './access-token.service';
import { ACCESS_TOKEN_TTL_SECONDS, LOGIN_LOCK_MS, MAX_FAILED_LOGINS } from './auth.constants';
import type { AdminPrincipal, IssuedSession, RequestMeta } from './auth.types';
import { PasswordService } from './password.service';
import { RefreshTokenService } from './refresh-token.service';

/**
 * Один текст на все неудачи входа: нет пользователя, неверный пароль,
 * блокировка, деактивация. Иначе форма входа превращается в проверку
 * «есть ли такой e-mail в админке».
 */
export const LOGIN_FAILED_MESSAGE = 'Неверный e-mail или пароль';

const USER_SELECT = {
  id: true,
  email: true,
  role: true,
  displayName: true,
  isActive: true,
  passwordHash: true,
  lockedUntil: true,
  tokenVersion: true,
} as const;

type SessionUser = Prisma.AdminUserGetPayload<{ select: typeof USER_SELECT }>;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function toPrincipal(user: Pick<SessionUser, 'id' | 'email' | 'role' | 'displayName'>): AdminPrincipal {
  return { id: user.id, email: user.email, role: user.role, displayName: user.displayName };
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly accessTokens: AccessTokenService,
    private readonly refreshTokens: RefreshTokenService,
  ) {}

  /**
   * Вход. bcrypt выполняется на каждой ветке — и для несуществующего
   * пользователя, и для заблокированного: время ответа одинаковое.
   */
  async login(email: string, password: string, meta: RequestMeta, now: Date = new Date()): Promise<IssuedSession> {
    const user = await this.prisma.adminUser.findUnique({
      where: { email: normalizeEmail(email) },
      select: USER_SELECT,
    });

    if (user === null) {
      await this.passwords.burnTime(password);
      throw new UnauthorizedException(LOGIN_FAILED_MESSAGE);
    }

    const isPasswordValid = await this.passwords.verify(password, user.passwordHash);
    const isLocked = user.lockedUntil !== null && user.lockedUntil.getTime() > now.getTime();

    if (!user.isActive || isLocked) {
      throw new UnauthorizedException(LOGIN_FAILED_MESSAGE);
    }

    if (!isPasswordValid) {
      await this.registerFailure(user.id, now);
      throw new UnauthorizedException(LOGIN_FAILED_MESSAGE);
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.adminUser.update({
        where: { id: user.id },
        data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: now },
      });

      return this.issueSession(tx, user, meta, now);
    });
  }

  /** Обновление сессии по refresh-cookie: новый access и новый refresh. */
  async refresh(refreshToken: string, meta: RequestMeta, now: Date = new Date()): Promise<IssuedSession> {
    const rotated = await this.refreshTokens.rotate(refreshToken, meta, now);
    const user = await this.prisma.adminUser.findUniqueOrThrow({
      where: { id: rotated.userId },
      select: USER_SELECT,
    });

    return {
      accessToken: await this.accessTokens.sign({ sub: user.id, ver: user.tokenVersion }),
      expiresIn: ACCESS_TOKEN_TTL_SECONDS,
      refreshToken: rotated.token,
      refreshExpiresAt: rotated.expiresAt,
      user: toPrincipal(user),
    };
  }

  async logout(refreshToken: string | null): Promise<void> {
    if (refreshToken !== null) {
      await this.refreshTokens.revokeByToken(refreshToken);
    }
  }

  async me(userId: string): Promise<AdminPrincipal> {
    const user = await this.prisma.adminUser.findUniqueOrThrow({ where: { id: userId }, select: USER_SELECT });

    return toPrincipal(user);
  }

  /**
   * Смена своего пароля. Все прежние сессии гаснут (и access, и refresh),
   * текущая вкладка получает новую — человеку не нужно входить заново.
   */
  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
    meta: RequestMeta,
    onChanged: (tx: Prisma.TransactionClient) => Promise<void> = async () => undefined,
  ): Promise<IssuedSession> {
    const user = await this.prisma.adminUser.findUniqueOrThrow({ where: { id: userId }, select: USER_SELECT });

    if (!(await this.passwords.verify(currentPassword, user.passwordHash))) {
      // 400, а не 401: 401 фронт трактует как «сессия истекла» и уходит в refresh.
      throw new BadRequestException('Текущий пароль указан неверно');
    }

    if (currentPassword === newPassword) {
      throw new BadRequestException('Новый пароль совпадает с текущим');
    }

    const passwordHash = await this.passwords.hash(newPassword);
    const now = new Date();

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.adminUser.update({
        where: { id: userId },
        data: { passwordHash, tokenVersion: { increment: 1 } },
        select: USER_SELECT,
      });

      await this.refreshTokens.revokeAllForUser(tx, userId, now);
      await onChanged(tx);

      return this.issueSession(tx, updated, meta, now);
    });
  }

  private async issueSession(
    tx: Prisma.TransactionClient,
    user: SessionUser,
    meta: RequestMeta,
    now: Date,
  ): Promise<IssuedSession> {
    const refresh = await this.refreshTokens.issue(tx, user.id, meta, undefined, now);

    return {
      accessToken: await this.accessTokens.sign({ sub: user.id, ver: user.tokenVersion }),
      expiresIn: ACCESS_TOKEN_TTL_SECONDS,
      refreshToken: refresh.token,
      refreshExpiresAt: refresh.expiresAt,
      user: toPrincipal(user),
    };
  }

  /**
   * Счётчик неудач — одним UPDATE: два параллельных неверных пароля
   * не должны дать «4 + 1 = 4». На пороге ставится блокировка, счётчик
   * сбрасывается — после неё снова пять попыток.
   */
  private async registerFailure(userId: string, now: Date): Promise<void> {
    const lockUntil = new Date(now.getTime() + LOGIN_LOCK_MS);
    const rows = await this.prisma.$queryRaw<{ locked: boolean }[]>`
      UPDATE "admin_user"
         SET "failed_login_count" = CASE
               WHEN "failed_login_count" + 1 >= ${MAX_FAILED_LOGINS} THEN 0
               ELSE "failed_login_count" + 1
             END,
             "locked_until" = CASE
               WHEN "failed_login_count" + 1 >= ${MAX_FAILED_LOGINS} THEN ${lockUntil}
               ELSE "locked_until"
             END,
             "updated_at" = now()
       WHERE "id" = ${userId}::uuid
      RETURNING ("locked_until" = ${lockUntil}) AS "locked"`;

    if (rows[0]?.locked === true) {
      this.logger.warn(`Вход пользователя ${userId} заблокирован после ${MAX_FAILED_LOGINS} неудачных попыток`);
    }
  }
}
