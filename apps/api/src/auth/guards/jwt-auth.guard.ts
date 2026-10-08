import { Injectable, UnauthorizedException } from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service';
import { AccessTokenService } from '../access-token.service';
import type { AdminPrincipal, AuthRequest } from '../auth.types';

const BEARER_PREFIX = 'Bearer ';

export function readBearer(request: AuthRequest): string | null {
  const header = request.headers.authorization;

  if (typeof header !== 'string' || !header.startsWith(BEARER_PREFIX)) {
    return null;
  }

  const token = header.slice(BEARER_PREFIX.length).trim();

  return token.length > 0 ? token : null;
}

/**
 * Проверка access-JWT админки.
 *
 * Пользователь перечитывается из БД на каждый запрос — это один запрос по
 * первичному ключу, а взамен деактивация, смена роли и смена пароля действуют
 * сразу, а не через 15 минут жизни токена. Роль берётся из БД, не из токена.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly tokens: AccessTokenService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthRequest>();
    const token = readBearer(request);

    if (token === null) {
      throw new UnauthorizedException('Требуется вход');
    }

    request.admin = await this.authenticate(token);

    return true;
  }

  async authenticate(token: string): Promise<AdminPrincipal> {
    const payload = await this.tokens.verify(token);
    const user = await this.prisma.adminUser.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, role: true, displayName: true, isActive: true, tokenVersion: true },
    });

    if (user === null || !user.isActive || user.tokenVersion !== payload.ver) {
      throw new UnauthorizedException('Сессия истекла или недействительна');
    }

    return { id: user.id, email: user.email, role: user.role, displayName: user.displayName };
  }
}
