import { UnauthorizedException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { AppConfig } from '../config/configuration';
import { AdminTokenGuard } from './admin-token.guard';

/**
 * Гард админских эндпоинтов. За ним лежит операция, двигающая сумму сбора,
 * поэтому проверяется не только «правильный токен проходит», но и каждый
 * способ проскочить мимо: без заголовка, с чужой схемой, с пустым токеном
 * в конфиге.
 */

const TOKEN = 'a'.repeat(32);

function guardWith(apiToken: string): AdminTokenGuard {
  return new AdminTokenGuard(new ConfigService<AppConfig, true>({ admin: { apiToken } }));
}

function contextWith(authorization?: string): ExecutionContext {
  const headers = authorization === undefined ? {} : { authorization };

  return {
    switchToHttp: () => ({ getRequest: () => ({ headers }) }),
  } as unknown as ExecutionContext;
}

describe('гард админского токена', () => {
  test('верный Bearer-токен пропускается', () => {
    // Arrange
    const guard = guardWith(TOKEN);

    // Act
    const allowed = guard.canActivate(contextWith(`Bearer ${TOKEN}`));

    // Assert
    expect(allowed).toBe(true);
  });

  test('запрос без заголовка отклоняется', () => {
    // Arrange
    const guard = guardWith(TOKEN);

    // Act
    const act = (): boolean => guard.canActivate(contextWith());

    // Assert
    expect(act).toThrow(UnauthorizedException);
  });

  test('чужой токен отклоняется', () => {
    // Arrange
    const guard = guardWith(TOKEN);

    // Act
    const act = (): boolean => guard.canActivate(contextWith(`Bearer ${'b'.repeat(32)}`));

    // Assert
    expect(act).toThrow(UnauthorizedException);
  });

  test('токен другой длины отклоняется, а не роняет сравнение', () => {
    // Arrange: timingSafeEqual падает на буферах разной длины — гард сравнивает
    // отпечатки фиксированного размера, поэтому это обычный отказ, а не 500
    const guard = guardWith(TOKEN);

    // Act
    const act = (): boolean => guard.canActivate(contextWith('Bearer короткий'));

    // Assert
    expect(act).toThrow(UnauthorizedException);
  });

  test('схема, отличная от Bearer, отклоняется', () => {
    // Arrange
    const guard = guardWith(TOKEN);

    // Act
    const act = (): boolean => guard.canActivate(contextWith(`Basic ${TOKEN}`));

    // Assert
    expect(act).toThrow(UnauthorizedException);
  });

  test('без ADMIN_API_TOKEN эндпоинт закрыт, а не открыт', () => {
    // Arrange: вне production переменной может не быть — забытая строка
    // в .env не должна оборачиваться публичным подтверждением донатов
    const guard = guardWith('');

    // Act
    const withoutHeader = (): boolean => guard.canActivate(contextWith());
    const withEmptyToken = (): boolean => guard.canActivate(contextWith('Bearer '));

    // Assert
    expect(withoutHeader).toThrow(UnauthorizedException);
    expect(withEmptyToken).toThrow(UnauthorizedException);
  });
});
