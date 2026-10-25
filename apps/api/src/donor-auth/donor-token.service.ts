import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';

import type { AppConfig } from '../config/configuration';
import {
  DONOR_ACCESS_AUDIENCE,
  DONOR_ACCESS_TTL_SECONDS,
  DONOR_JWT_ISSUER,
  DONOR_REFRESH_AUDIENCE,
  DONOR_REFRESH_TTL_SECONDS,
} from './donor-auth.constants';
import type { DonorTokenPayload } from './donor-auth.types';

const JWT_ALGORITHM = 'HS256';

const INVALID_SESSION = 'Сессия истекла или недействительна';

type TokenKind = 'access' | 'refresh';

const AUDIENCE: Readonly<Record<TokenKind, string>> = {
  access: DONOR_ACCESS_AUDIENCE,
  refresh: DONOR_REFRESH_AUDIENCE,
};

const TTL_SECONDS: Readonly<Record<TokenKind, number>> = {
  access: DONOR_ACCESS_TTL_SECONDS,
  refresh: DONOR_REFRESH_TTL_SECONDS,
};

/**
 * JWT кабинета жертвователя: свой ключ (`DONOR_JWT_SECRET`), свои аудитории.
 *
 * `JwtService` создаётся здесь, а не берётся из `JwtModule`: модуль админки
 * регистрирует свой экземпляр с `ADMIN_JWT_SECRET`, и подхватить его по DI
 * значило бы подписывать токены жертвователей админским ключом.
 *
 * Refresh — тоже JWT, без таблицы: отзыв держится на `token_version`.
 * Выход увеличивает версию, и все выданные токены перестают приниматься
 * на всех устройствах сразу. Для кабинета, где нет денег на счёте и ролей,
 * этого достаточно; ротация по таблице, как у админки, — избыточна.
 */
@Injectable()
export class DonorTokenService {
  private readonly jwt: JwtService;

  constructor(config: ConfigService<AppConfig, true>) {
    this.jwt = new JwtService({ secret: config.get('donor', { infer: true }).jwtSecret });
  }

  sign(kind: TokenKind, payload: DonorTokenPayload): Promise<string> {
    return this.jwt.signAsync(
      { ver: payload.ver },
      {
        subject: payload.sub,
        algorithm: JWT_ALGORITHM,
        expiresIn: TTL_SECONDS[kind],
        issuer: DONOR_JWT_ISSUER,
        audience: AUDIENCE[kind],
      },
    );
  }

  ttlSeconds(kind: TokenKind): number {
    return TTL_SECONDS[kind];
  }

  /** Любая проблема с токеном — 401 без подробностей. */
  async verify(kind: TokenKind, token: string): Promise<DonorTokenPayload> {
    let decoded: unknown;

    try {
      decoded = await this.jwt.verifyAsync<Record<string, unknown>>(token, {
        algorithms: [JWT_ALGORITHM],
        issuer: DONOR_JWT_ISSUER,
        audience: AUDIENCE[kind],
      });
    } catch {
      throw new UnauthorizedException(INVALID_SESSION);
    }

    if (!isPayload(decoded)) {
      throw new UnauthorizedException(INVALID_SESSION);
    }

    return { sub: decoded.sub, ver: decoded.ver };
  }
}

function isPayload(value: unknown): value is { sub: string; ver: number } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'sub' in value &&
    typeof value.sub === 'string' &&
    'ver' in value &&
    typeof value.ver === 'number' &&
    Number.isInteger(value.ver)
  );
}
