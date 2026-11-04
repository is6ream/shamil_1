import { createHash, randomBytes } from 'node:crypto';

import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';

import { PrismaService } from '../database/prisma.service';
import type { Prisma } from '../generated/prisma/client';
import { DONOR_REFRESH_TOKEN_BYTES, DONOR_SESSION_TTL_MS } from './donor-auth.constants';
import type { DonorRequestMeta, DonorSession } from './donor-auth.types';
import { DonorTokenService } from './donor-token.service';

type Db = PrismaService | Prisma.TransactionClient;

const INVALID_SESSION = 'Сессия истекла или недействительна';

/** SHA-256 в hex: в базе лежит только отпечаток, утечка таблицы входа не даёт. */
export function hashDonorRefreshToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

/** Живая сессия — то, что проверяет гард на каждом запросе. */
export interface ActiveSession {
  readonly sessionId: string;
  readonly donorId: string;
  readonly email: string | null;
  readonly createdAt: Date;
}

/**
 * Сессии кабинета: одна строка `donor_session` на устройство и цепочка
 * refresh-токенов к ней. Каждое обновление гасит предъявленный токен и
 * выдаёт следующий; погашенный предъявлен снова — у кого-то копия, и
 * сессия отзывается целиком. Тот же приём, что у админки (D-05), но свои
 * таблицы: токены двух кабинетов не пересекаются даже в базе.
 */
@Injectable()
export class DonorSessionService {
  private readonly logger = new Logger(DonorSessionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: DonorTokenService,
  ) {}

  /** Новая сессия при входе. */
  async open(
    donor: { id: string; email: string | null },
    meta: DonorRequestMeta,
    isNew: boolean,
    now: Date = new Date(),
  ): Promise<DonorSession> {
    const refreshToken = newRefreshToken();
    const expiresAt = new Date(now.getTime() + DONOR_SESSION_TTL_MS);
    const session = await this.prisma.donorSession.create({
      data: {
        donorId: donor.id,
        ip: meta.ip,
        userAgent: meta.userAgent,
        expiresAt,
        // Явно, а не default БД: «свежий вход» для удаления считается от этого
        // момента, и часы должны быть одни — те же, что у `now` в проверке.
        createdAt: now,
        lastUsedAt: now,
        refreshTokens: { create: { tokenHash: hashDonorRefreshToken(refreshToken) } },
      },
      select: { id: true },
    });

    return this.issue(donor, session.id, refreshToken, expiresAt, isNew);
  }

  /** Ротация по refresh-cookie. Любой отказ — 401 с одинаковым текстом. */
  async rotate(refreshToken: string, meta: DonorRequestMeta, now: Date = new Date()): Promise<DonorSession> {
    const stored = await this.prisma.donorRefreshToken.findUnique({
      where: { tokenHash: hashDonorRefreshToken(refreshToken) },
      select: {
        id: true,
        usedAt: true,
        session: {
          select: {
            id: true,
            expiresAt: true,
            revokedAt: true,
            donor: { select: { id: true, email: true, deletedAt: true } },
          },
        },
      },
    });

    if (stored === null) {
      throw new UnauthorizedException(INVALID_SESSION);
    }

    const { session } = stored;

    if (stored.usedAt !== null) {
      await this.revokeAfterReuse(session.id, now);
      throw new UnauthorizedException(INVALID_SESSION);
    }

    if (session.revokedAt !== null || session.expiresAt <= now || session.donor.deletedAt !== null) {
      throw new UnauthorizedException(INVALID_SESSION);
    }

    const next = newRefreshToken();
    const expiresAt = new Date(now.getTime() + DONOR_SESSION_TTL_MS);
    const rotated = await this.prisma.$transaction(async (tx) => {
      // Условное гашение: из двух параллельных обновлений одним токеном
      // выиграет одно, второе увидит count = 0 и пойдёт как повтор.
      const consumed = await tx.donorRefreshToken.updateMany({
        where: { id: stored.id, usedAt: null },
        data: { usedAt: now },
      });

      if (consumed.count === 0) {
        return false;
      }

      await tx.donorRefreshToken.create({ data: { sessionId: session.id, tokenHash: hashDonorRefreshToken(next) } });
      await tx.donorSession.update({
        where: { id: session.id },
        data: { expiresAt, lastUsedAt: now, ip: meta.ip, userAgent: meta.userAgent },
      });

      return true;
    });

    if (!rotated) {
      await this.revokeAfterReuse(session.id, now);
      throw new UnauthorizedException(INVALID_SESSION);
    }

    return this.issue(session.donor, session.id, next, expiresAt, false);
  }

  /** Сессия по access-токену: жива, не истекла, аккаунт не удалён. Иначе 401. */
  async findActive(donorId: string, sessionId: string, now: Date = new Date()): Promise<ActiveSession> {
    const session = await this.prisma.donorSession.findFirst({
      where: { id: sessionId, donorId, revokedAt: null, expiresAt: { gt: now }, donor: { deletedAt: null } },
      select: { id: true, createdAt: true, donor: { select: { id: true, email: true } } },
    });

    if (session === null) {
      throw new UnauthorizedException(INVALID_SESSION);
    }

    return { sessionId: session.id, donorId: session.donor.id, email: session.donor.email, createdAt: session.createdAt };
  }

  /** Выход с этого устройства. Неизвестный токен — не ошибка: выйти и так вышли. */
  async revokeByToken(refreshToken: string, now: Date = new Date()): Promise<void> {
    const stored = await this.prisma.donorRefreshToken.findUnique({
      where: { tokenHash: hashDonorRefreshToken(refreshToken) },
      select: { sessionId: true },
    });

    if (stored !== null) {
      await this.revoke(this.prisma, stored.sessionId, now);
    }
  }

  async revoke(db: Db, sessionId: string, now: Date = new Date()): Promise<void> {
    await db.donorSession.updateMany({ where: { id: sessionId, revokedAt: null }, data: { revokedAt: now } });
  }

  /** Все устройства: удаление аккаунта. */
  async revokeAll(db: Db, donorId: string, now: Date = new Date()): Promise<void> {
    await db.donorSession.updateMany({ where: { donorId, revokedAt: null }, data: { revokedAt: now } });
  }

  private async issue(
    donor: { id: string; email: string | null },
    sessionId: string,
    refreshToken: string,
    refreshExpiresAt: Date,
    isNew: boolean,
  ): Promise<DonorSession> {
    return {
      accessToken: await this.tokens.sign({ sub: donor.id, sid: sessionId }),
      expiresIn: this.tokens.ttlSeconds(),
      refreshToken,
      refreshExpiresAt,
      donor: { id: donor.id, email: donor.email },
      isNew,
    };
  }

  private async revokeAfterReuse(sessionId: string, now: Date): Promise<void> {
    await this.revoke(this.prisma, sessionId, now);
    // Ни токена, ни e-mail в логе — только идентификатор для разбора.
    this.logger.warn(`Повторное предъявление refresh-токена: сессия ${sessionId} отозвана`);
  }
}

function newRefreshToken(): string {
  return randomBytes(DONOR_REFRESH_TOKEN_BYTES).toString('base64url');
}
