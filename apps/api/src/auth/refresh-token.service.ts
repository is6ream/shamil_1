import { createHash, randomBytes, randomUUID } from 'node:crypto';

import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';

import { PrismaService } from '../database/prisma.service';
import type { Prisma } from '../generated/prisma/client';
import { REFRESH_TOKEN_BYTES, REFRESH_TOKEN_TTL_MS } from './auth.constants';
import type { RequestMeta } from './auth.types';

export interface IssuedRefreshToken {
  readonly token: string;
  readonly expiresAt: Date;
}

export interface RotatedRefreshToken extends IssuedRefreshToken {
  readonly userId: string;
}

type Db = PrismaService | Prisma.TransactionClient;

const INVALID_SESSION = 'Сессия истекла или недействительна';

/** SHA-256 в hex: в базе лежит только отпечаток, утечка таблицы входа не даёт. */
export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

/**
 * Refresh-токены с ротацией и обнаружением повторного использования (D-05).
 *
 * Все токены одной цепочки ротаций — одно семейство (`family_id`). Каждое
 * обновление гасит предъявленный токен и выдаёт следующий. Если погашенный
 * токен предъявлен снова — значит, его копия у кого-то ещё: семейство
 * отзывается целиком, и вор, и владелец входят заново.
 */
@Injectable()
export class RefreshTokenService {
  private readonly logger = new Logger(RefreshTokenService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Новый токен. Без `familyId` — новое семейство (вход). */
  async issue(
    db: Db,
    userId: string,
    meta: RequestMeta,
    familyId: string = randomUUID(),
    now: Date = new Date(),
  ): Promise<IssuedRefreshToken> {
    const token = randomBytes(REFRESH_TOKEN_BYTES).toString('base64url');
    const expiresAt = new Date(now.getTime() + REFRESH_TOKEN_TTL_MS);

    await db.adminRefreshToken.create({
      data: { userId, familyId, tokenHash: hashRefreshToken(token), expiresAt, userAgent: meta.userAgent },
    });

    return { token, expiresAt };
  }

  /**
   * Ротация: гасит предъявленный токен и выдаёт следующий в том же семействе.
   * Любой отказ — 401 с одинаковым текстом.
   */
  async rotate(token: string, meta: RequestMeta, now: Date = new Date()): Promise<RotatedRefreshToken> {
    const stored = await this.prisma.adminRefreshToken.findUnique({
      where: { tokenHash: hashRefreshToken(token) },
      select: {
        id: true,
        familyId: true,
        userId: true,
        expiresAt: true,
        revokedAt: true,
        user: { select: { isActive: true } },
      },
    });

    if (stored === null) {
      throw new UnauthorizedException(INVALID_SESSION);
    }

    if (stored.revokedAt !== null) {
      await this.revokeFamilyAfterReuse(stored.familyId, stored.userId, now);
      throw new UnauthorizedException(INVALID_SESSION);
    }

    if (stored.expiresAt.getTime() <= now.getTime() || !stored.user.isActive) {
      await this.revokeFamily(stored.familyId, now);
      throw new UnauthorizedException(INVALID_SESSION);
    }

    const next = await this.prisma.$transaction(async (tx) => {
      // Условное гашение: из двух параллельных обновлений одним токеном
      // выиграет одно, второе увидит count = 0 и пойдёт как повтор.
      const consumed = await tx.adminRefreshToken.updateMany({
        where: { id: stored.id, revokedAt: null },
        data: { revokedAt: now },
      });

      if (consumed.count === 0) {
        return null;
      }

      return this.issue(tx, stored.userId, meta, stored.familyId, now);
    });

    if (next === null) {
      await this.revokeFamilyAfterReuse(stored.familyId, stored.userId, now);
      throw new UnauthorizedException(INVALID_SESSION);
    }

    return { ...next, userId: stored.userId };
  }

  /** Выход: гасится всё семейство предъявленного токена. Неизвестный токен — не ошибка. */
  async revokeByToken(token: string, now: Date = new Date()): Promise<void> {
    const stored = await this.prisma.adminRefreshToken.findUnique({
      where: { tokenHash: hashRefreshToken(token) },
      select: { familyId: true },
    });

    if (stored !== null) {
      await this.revokeFamily(stored.familyId, now);
    }
  }

  /** Все сессии пользователя: смена пароля, деактивация, смена роли. */
  async revokeAllForUser(db: Db, userId: string, now: Date = new Date()): Promise<void> {
    await db.adminRefreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: now } });
  }

  private async revokeFamily(familyId: string, now: Date): Promise<void> {
    await this.prisma.adminRefreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: now },
    });
  }

  private async revokeFamilyAfterReuse(familyId: string, userId: string, now: Date): Promise<void> {
    await this.revokeFamily(familyId, now);
    // Ни токена, ни e-mail в логе — только идентификаторы для разбора.
    this.logger.warn(
      `Повторное предъявление refresh-токена: семейство ${familyId} пользователя ${userId} отозвано`,
    );
  }
}
