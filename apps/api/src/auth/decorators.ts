import { SetMetadata, UnauthorizedException, createParamDecorator } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';

import type { AdminRole } from '../generated/prisma/enums';
import type { AdminPrincipal, AuthRequest } from './auth.types';

export const ROLES_METADATA_KEY = 'admin:roles';

/**
 * Какие роли допускаются к обработчику. Без `@Roles()` на админском маршруте
 * `RolesGuard` отказывает всем: забытый декоратор не должен открывать доступ.
 */
export const Roles = (...roles: readonly AdminRole[]): MethodDecorator & ClassDecorator =>
  SetMetadata(ROLES_METADATA_KEY, roles);

/** Текущий пользователь админки. Гард уже гарантировал, что он есть. */
export const CurrentAdmin = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AdminPrincipal => {
    const admin = context.switchToHttp().getRequest<AuthRequest>().admin;

    if (admin === undefined) {
      // Сюда можно попасть только забыв JwtAuthGuard на контроллере.
      throw new UnauthorizedException('Требуется вход');
    }

    return admin;
  },
);
