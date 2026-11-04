import { Injectable, UnauthorizedException, createParamDecorator } from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';

import { readBearer } from '../auth/guards/jwt-auth.guard';
import type { DonorPrincipal, DonorRequest } from './donor-auth.types';
import { DonorSessionService } from './donor-session.service';
import { DonorTokenService } from './donor-token.service';

/**
 * Проверка access-JWT жертвователя. Админский токен сюда не проходит
 * (другой ключ и `aud`), токен жертвователя не проходит `JwtAuthGuard`
 * админки — оба случая закреплены тестом.
 *
 * Сессия перечитывается из БД на каждый запрос: выход или удаление
 * аккаунта гасят токены сразу, а не через 15 минут.
 */
@Injectable()
export class DonorJwtGuard implements CanActivate {
  constructor(
    private readonly tokens: DonorTokenService,
    private readonly sessions: DonorSessionService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<DonorRequest>();
    const token = readBearer(request);

    if (token === null) {
      throw new UnauthorizedException('Требуется вход');
    }

    request.donor = await this.authenticate(token);

    return true;
  }

  async authenticate(token: string): Promise<DonorPrincipal> {
    const payload = await this.tokens.verify(token);
    const session = await this.sessions.findActive(payload.sub, payload.sid);

    return { id: session.donorId, sessionId: session.sessionId, email: session.email };
  }
}

/** Текущий жертвователь. Гард уже гарантировал, что он есть. */
export const CurrentDonor = createParamDecorator((_data: unknown, context: ExecutionContext): DonorPrincipal => {
  const donor = context.switchToHttp().getRequest<DonorRequest>().donor;

  if (donor === undefined) {
    // Сюда можно попасть, только забыв DonorJwtGuard на контроллере.
    throw new UnauthorizedException('Требуется вход');
  }

  return donor;
});
