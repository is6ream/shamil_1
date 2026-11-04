import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';

import type { AppConfig } from '../config/configuration';
import { DONOR_ACCESS_AUDIENCE, DONOR_ACCESS_TTL_SECONDS, DONOR_JWT_ISSUER } from './donor-auth.constants';
import type { DonorTokenPayload } from './donor-auth.types';

const JWT_ALGORITHM = 'HS256';

const INVALID_SESSION = 'Сессия истекла или недействительна';

/**
 * Access-JWT кабинета жертвователя: свой ключ (`DONOR_JWT_SECRET`), своя аудитория.
 * Refresh — не JWT, а случайная строка с ротацией (`DonorSessionService`).
 *
 * `JwtService` создаётся здесь, а не берётся из `JwtModule`: модуль админки
 * регистрирует свой экземпляр с `ADMIN_JWT_SECRET`, и подхватить его по DI
 * значило бы подписывать токены жертвователей админским ключом.
 */
@Injectable()
export class DonorTokenService {
  private readonly jwt: JwtService;

  constructor(config: ConfigService<AppConfig, true>) {
    this.jwt = new JwtService({ secret: config.get('donor', { infer: true }).jwtSecret });
  }

  sign(payload: DonorTokenPayload): Promise<string> {
    return this.jwt.signAsync(
      { sid: payload.sid },
      {
        subject: payload.sub,
        algorithm: JWT_ALGORITHM,
        expiresIn: DONOR_ACCESS_TTL_SECONDS,
        issuer: DONOR_JWT_ISSUER,
        audience: DONOR_ACCESS_AUDIENCE,
      },
    );
  }

  ttlSeconds(): number {
    return DONOR_ACCESS_TTL_SECONDS;
  }

  /** Любая проблема с токеном — 401 без подробностей. */
  async verify(token: string): Promise<DonorTokenPayload> {
    let decoded: unknown;

    try {
      decoded = await this.jwt.verifyAsync<Record<string, unknown>>(token, {
        algorithms: [JWT_ALGORITHM],
        issuer: DONOR_JWT_ISSUER,
        audience: DONOR_ACCESS_AUDIENCE,
      });
    } catch {
      throw new UnauthorizedException(INVALID_SESSION);
    }

    if (!isPayload(decoded)) {
      throw new UnauthorizedException(INVALID_SESSION);
    }

    return { sub: decoded.sub, sid: decoded.sid };
  }
}

function isPayload(value: unknown): value is { sub: string; sid: string } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'sub' in value &&
    typeof value.sub === 'string' &&
    'sid' in value &&
    typeof value.sid === 'string'
  );
}
