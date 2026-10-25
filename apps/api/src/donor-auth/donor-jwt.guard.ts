import { Injectable, UnauthorizedException, createParamDecorator } from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';

import { readBearer } from '../auth/guards/jwt-auth.guard';
import { PrismaService } from '../database/prisma.service';
import type { DonorPrincipal, DonorRequest } from './donor-auth.types';
import { DonorTokenService } from './donor-token.service';

const INVALID_SESSION = 'Сессия истекла или недействительна';

/**
 * Проверка access-JWT жертвователя. Админский токен сюда не проходит
 * (другой ключ и `aud`), токен жертвователя не проходит `JwtAuthGuard`
 * админки — оба случая закреплены тестом.
 *
 * Жертвователь перечитывается из БД на каждый запрос: выход на одном
 * устройстве (рост `token_version`) гасит токены сразу, а не через 15 минут.
 */
@Injectable()
export class DonorJwtGuard implements CanActivate {
  constructor(
    private readonly tokens: DonorTokenService,
    private readonly prisma: PrismaService,
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
    const payload = await this.tokens.verify('access', token);
    const donor = await this.prisma.donorUser.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, tokenVersion: true },
    });

    if (donor === null || donor.tokenVersion !== payload.ver) {
      throw new UnauthorizedException(INVALID_SESSION);
    }

    return { id: donor.id, email: donor.email };
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
