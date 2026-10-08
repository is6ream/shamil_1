import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { AdminRole } from '../../generated/prisma/enums';
import type { AuthRequest } from '../auth.types';
import { ROLES_METADATA_KEY } from '../decorators';
import {
  ALL_ROLES,
  AUDIT_ROLES,
  CONTENT_ROLES,
  DONATION_READ_ROLES,
  DONATION_WRITE_ROLES,
  EXPORT_ROLES,
  GOAL_ROLES,
  PII_ROLES,
  REQUISITES_ROLES,
  USERS_ROLES,
  canSeePersonalData,
} from '../roles';
import { RolesGuard } from './roles.guard';

function contextFor(request: Partial<AuthRequest>, roles?: readonly AdminRole[]): {
  context: ExecutionContext;
  reflector: Reflector;
} {
  const handler = (): void => undefined;
  const reflector = new Reflector();

  if (roles !== undefined) {
    Reflect.defineMetadata(ROLES_METADATA_KEY, roles, handler);
  }

  const context = {
    getHandler: () => handler,
    getClass: () => class {},
    switchToHttp: () => ({ getRequest: () => ({ headers: {}, ...request }) }),
  } as unknown as ExecutionContext;

  return { context, reflector };
}

function admin(role: AdminRole): AuthRequest['admin'] {
  return { id: '00000000-0000-4000-8000-000000000001', email: 'a@b.test', role, displayName: null };
}

describe('гард ролей', () => {
  test('роль из списка пропускается', () => {
    // Arrange
    const { context, reflector } = contextFor({ admin: admin(AdminRole.EDITOR) }, CONTENT_ROLES);

    // Act
    const allowed = new RolesGuard(reflector).canActivate(context);

    // Assert
    expect(allowed).toBe(true);
  });

  test('роль вне списка — 403', () => {
    // Arrange
    const { context, reflector } = contextFor({ admin: admin(AdminRole.ACCOUNTANT) }, CONTENT_ROLES);

    // Act
    const act = (): boolean => new RolesGuard(reflector).canActivate(context);

    // Assert
    expect(act).toThrow(ForbiddenException);
  });

  test('маршрут без @Roles() закрыт для всех, даже для суперадмина', () => {
    // Arrange: забытый декоратор не должен открывать доступ
    const { context, reflector } = contextFor({ admin: admin(AdminRole.SUPER_ADMIN) });

    // Act
    const act = (): boolean => new RolesGuard(reflector).canActivate(context);

    // Assert
    expect(act).toThrow(ForbiddenException);
  });

  test('без пользователя в запросе — 401', () => {
    // Arrange
    const { context, reflector } = contextFor({}, ALL_ROLES);

    // Act
    const act = (): boolean => new RolesGuard(reflector).canActivate(context);

    // Assert
    expect(act).toThrow(UnauthorizedException);
  });

  test('статический токен (D-07) проходит без роли', () => {
    // Arrange
    const { context, reflector } = contextFor({ viaApiToken: true }, DONATION_WRITE_ROLES);

    // Act
    const allowed = new RolesGuard(reflector).canActivate(context);

    // Assert
    expect(allowed).toBe(true);
  });
});

describe('матрица прав D-06', () => {
  const { SUPER_ADMIN, EDITOR, ACCOUNTANT } = AdminRole;

  test.each([
    ['контент, медиа, видео', CONTENT_ROLES, [SUPER_ADMIN, EDITOR]],
    ['реквизиты счёта (D-17)', REQUISITES_ROLES, [SUPER_ADMIN]],
    ['цель сбора и месяца', GOAL_ROLES, [SUPER_ADMIN, EDITOR]],
    ['ручное поступление и подтверждение', DONATION_WRITE_ROLES, [SUPER_ADMIN, EDITOR, ACCOUNTANT]],
    ['список пожертвований, дашборд', DONATION_READ_ROLES, [SUPER_ADMIN, EDITOR, ACCOUNTANT]],
    ['ПДн без маски', PII_ROLES, [SUPER_ADMIN, ACCOUNTANT]],
    ['экспорт CSV', EXPORT_ROLES, [SUPER_ADMIN, ACCOUNTANT]],
    ['журнал действий', AUDIT_ROLES, [SUPER_ADMIN, ACCOUNTANT]],
    ['пользователи админки', USERS_ROLES, [SUPER_ADMIN]],
  ])('%s', (_name, actual, expected) => {
    // Assert
    expect([...actual].sort()).toEqual([...expected].sort());
  });

  test('редактор не видит ПДн, бухгалтер и суперадмин видят', () => {
    // Assert
    expect(canSeePersonalData(EDITOR)).toBe(false);
    expect(canSeePersonalData(ACCOUNTANT)).toBe(true);
    expect(canSeePersonalData(SUPER_ADMIN)).toBe(true);
  });
});
