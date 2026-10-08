import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

import { ACCESS_TOKEN_TTL_SECONDS, JWT_AUDIENCE, JWT_ISSUER } from './auth.constants';
import type { AccessTokenPayload } from './auth.types';

const JWT_ALGORITHM = 'HS256';

/**
 * Access-JWT админки. Подпись HS256 ключом `ADMIN_JWT_SECRET`, алгоритм
 * зафиксирован и при проверке: токен с `alg: none` или с другим алгоритмом
 * не проходит, даже если библиотека его поддерживает.
 */
@Injectable()
export class AccessTokenService {
  constructor(private readonly jwt: JwtService) {}

  async sign(payload: AccessTokenPayload): Promise<string> {
    return this.jwt.signAsync(
      { ver: payload.ver },
      {
        subject: payload.sub,
        algorithm: JWT_ALGORITHM,
        expiresIn: ACCESS_TOKEN_TTL_SECONDS,
        issuer: JWT_ISSUER,
        audience: JWT_AUDIENCE,
      },
    );
  }

  /** Любая проблема с токеном — 401 без подробностей: что именно не так, клиенту знать незачем. */
  async verify(token: string): Promise<AccessTokenPayload> {
    let decoded: unknown;

    try {
      decoded = await this.jwt.verifyAsync<Record<string, unknown>>(token, {
        algorithms: [JWT_ALGORITHM],
        issuer: JWT_ISSUER,
        audience: JWT_AUDIENCE,
      });
    } catch {
      throw new UnauthorizedException('Сессия истекла или недействительна');
    }

    if (!isPayload(decoded)) {
      throw new UnauthorizedException('Сессия истекла или недействительна');
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
