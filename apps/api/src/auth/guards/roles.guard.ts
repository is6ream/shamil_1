import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import type { AdminRole } from '../../generated/prisma/enums';
import type { AuthRequest } from '../auth.types';
import { ROLES_METADATA_KEY } from '../decorators';

/**
 * Проверка роли по матрице D-06. Ставится после `JwtAuthGuard`
 * (или `JwtOrApiTokenGuard`), который кладёт пользователя в запрос.
 *
 * Нет `@Roles()` — отказ: забытый декоратор не должен открывать маршрут всем.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthRequest>();

    if (request.viaApiToken === true) {
      // Статический токен (D-07) ставит только JwtOrApiTokenGuard — и только
      // на маршруте подтверждения перевода. Ролей у токена нет.
      return true;
    }

    const roles = this.reflector.getAllAndOverride<readonly AdminRole[] | undefined>(ROLES_METADATA_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (request.admin === undefined) {
      throw new UnauthorizedException('Требуется вход');
    }

    if (roles === undefined || !roles.includes(request.admin.role)) {
      throw new ForbiddenException('Недостаточно прав');
    }

    return true;
  }
}
