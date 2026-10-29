import { UnauthorizedException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';

import { AccessTokenService } from '../auth/access-token.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AppConfig, DonorConfig } from '../config/configuration';
import type { PrismaService } from '../database/prisma.service';
import { createTestPrismaService, describeDatabase, resetDatabase } from '../database/testing/test-database';
import { LogMailSender } from '../mail/log-mail.sender';
import { CODE_HOURLY_LIMIT, MAX_CODE_ATTEMPTS } from './donor-auth.constants';
import { DonorAuthController } from './donor-auth.controller';
import { DonorAuthService } from './donor-auth.service';
import { DonorJwtGuard } from './donor-jwt.guard';
import { DonorTokenService } from './donor-token.service';
import * as loginCode from './login-code';
import { hashLoginCode } from './login-code';

const DONOR: DonorConfig = {
  enabled: true,
  jwtSecret: 'donor-jwt-secret-'.padEnd(48, 'd'),
  hmacSecret: 'donor-hmac-secret-'.padEnd(48, 'h'),
  cookieSecure: false,
};
const ADMIN_SECRET = 'admin-jwt-secret-'.padEnd(48, 'a');
const EMAIL = 'donor@example.test';
const MINUTE_MS = 60_000;

function contextFor(token: string): ExecutionContext {
  const request = { headers: { authorization: `Bearer ${token}` } };

  return { switchToHttp: () => ({ getRequest: () => request }) } as unknown as ExecutionContext;
}

/** Код из последнего письма лог-отправителя. */
function lastCode(mail: LogMailSender): string {
  const match = /(\d{6})/.exec(mail.outbox().at(-1)?.subject ?? '');

  if (match?.[1] === undefined) {
    throw new Error('Письма с кодом нет');
  }

  return match[1];
}

describe('токены жертвователя и админки не взаимозаменяемы', () => {
  const donorTokens = new DonorTokenService(new ConfigService<AppConfig, true>({ donor: DONOR }));
  const adminTokens = new AccessTokenService(new JwtService({ secret: ADMIN_SECRET }));

  test('токен админки не проходит проверку кабинета', async () => {
    // Arrange
    const adminToken = await adminTokens.sign({ sub: 'admin-id', ver: 0 });

    // Act & Assert
    await expect(donorTokens.verify('access', adminToken)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  test('токен жертвователя не проходит проверку админки', async () => {
    // Arrange
    const donorToken = await donorTokens.sign('access', { sub: 'donor-id', ver: 0 });

    // Act & Assert
    await expect(adminTokens.verify(donorToken)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  test('даже при одинаковом ключе админский aud не пускает токен жертвователя', async () => {
    // Arrange: худший случай — ключи совпали по ошибке конфигурации
    const sameKeyAdmin = new AccessTokenService(new JwtService({ secret: DONOR.jwtSecret }));
    const donorToken = await donorTokens.sign('access', { sub: 'donor-id', ver: 0 });

    // Act & Assert
    await expect(sameKeyAdmin.verify(donorToken)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  test('refresh-токен не годится как access', async () => {
    // Arrange
    const refresh = await donorTokens.sign('refresh', { sub: 'donor-id', ver: 0 });

    // Act & Assert
    await expect(donorTokens.verify('access', refresh)).rejects.toBeInstanceOf(UnauthorizedException);
  });
});

describeDatabase('вход жертвователя по коду', () => {
  let prisma: PrismaService;
  let mail: LogMailSender;
  let tokens: DonorTokenService;
  let service: DonorAuthService;

  beforeAll(() => {
    prisma = createTestPrismaService();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    mail = new LogMailSender(false);
    const config = new ConfigService<AppConfig, true>({ donor: DONOR });
    tokens = new DonorTokenService(config);
    service = new DonorAuthService(prisma, tokens, mail, config);
  });

  test('в базе хранится HMAC кода, а не сам код', async () => {
    // Act
    await service.requestCode(EMAIL);

    // Assert
    const code = lastCode(mail);
    const stored = await prisma.donorAuthCode.findFirstOrThrow({ where: { email: EMAIL } });
    expect(stored.codeHash).not.toContain(code);
    expect(stored.codeHash).toBe(hashLoginCode(DONOR.hmacSecret, EMAIL, code));
  });

  test('первый вход создаёт аккаунт, второй — нет', async () => {
    // Arrange
    await service.requestCode(EMAIL);

    // Act
    const first = await service.verify(EMAIL, lastCode(mail));
    await service.requestCode(EMAIL, new Date(Date.now() + 61_000));
    const second = await service.verify(EMAIL, lastCode(mail), new Date(Date.now() + 62_000));

    // Assert
    expect(first.isNew).toBe(true);
    expect(second.isNew).toBe(false);
    expect(second.donor.id).toBe(first.donor.id);
    expect(await prisma.donorUser.count()).toBe(1);
  });

  test('код одноразовый', async () => {
    // Arrange
    await service.requestCode(EMAIL);
    const code = lastCode(mail);
    await service.verify(EMAIL, code);

    // Act & Assert
    await expect(service.verify(EMAIL, code)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  test('после пяти неверных попыток не принимается даже верный код', async () => {
    // Arrange
    await service.requestCode(EMAIL);
    const code = lastCode(mail);
    const wrong = code === '000000' ? '111111' : '000000';

    for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt += 1) {
      await expect(service.verify(EMAIL, wrong)).rejects.toBeInstanceOf(UnauthorizedException);
    }

    // Act & Assert
    await expect(service.verify(EMAIL, code)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  test('просроченный код не принимается', async () => {
    // Arrange
    await service.requestCode(EMAIL);

    // Act & Assert: через 11 минут
    await expect(service.verify(EMAIL, lastCode(mail), new Date(Date.now() + 11 * 60_000))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  test('повторный запрос раньше чем через минуту письма не шлёт', async () => {
    // Act
    await service.requestCode(EMAIL);
    await service.requestCode(EMAIL);

    // Assert
    expect(mail.outbox()).toHaveLength(1);
  });

  test('выход гасит и access, и refresh на всех устройствах', async () => {
    // Arrange
    await service.requestCode(EMAIL);
    const session = await service.verify(EMAIL, lastCode(mail));
    const guard = new DonorJwtGuard(tokens, prisma);
    await expect(guard.canActivate(contextFor(session.accessToken))).resolves.toBe(true);

    // Act
    await service.logout(session.refreshToken);

    // Assert
    await expect(guard.canActivate(contextFor(session.accessToken))).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(service.refresh(session.refreshToken)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  test('гард админки не пускает токен жертвователя', async () => {
    // Arrange
    await service.requestCode(EMAIL);
    const session = await service.verify(EMAIL, lastCode(mail));
    const adminGuard = new JwtAuthGuard(new AccessTokenService(new JwtService({ secret: ADMIN_SECRET })), prisma);

    // Act & Assert
    await expect(adminGuard.canActivate(contextFor(session.accessToken))).rejects.toBeInstanceOf(UnauthorizedException);
  });
  test('ответ на запрос кода одинаков для нового и уже известного адреса', async () => {
    // Arrange
    const known = 'known@example.test';
    await prisma.donorUser.create({ data: { email: known } });
    const controller = new DonorAuthController(service, new ConfigService<AppConfig, true>({ donor: DONOR }));

    // Act
    const forKnown = await controller.requestCode({ email: known });
    const forNew = await controller.requestCode({ email: EMAIL });

    // Assert: тело одно и то же, аккаунт по запросу кода не создаётся
    expect(forNew).toEqual(forKnown);
    expect(await prisma.donorUser.count({ where: { email: EMAIL } })).toBe(0);
    expect(mail.outbox()).toHaveLength(2);
  });

  test('шестая попытка отклоняется и счётчик не растёт выше лимита', async () => {
    // Arrange
    await service.requestCode(EMAIL);
    const code = lastCode(mail);
    const wrong = code === '000000' ? '111111' : '000000';

    for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt += 1) {
      await expect(service.verify(EMAIL, wrong)).rejects.toBeInstanceOf(UnauthorizedException);
    }

    // Act & Assert
    await expect(service.verify(EMAIL, wrong)).rejects.toBeInstanceOf(UnauthorizedException);
    const stored = await prisma.donorAuthCode.findFirstOrThrow({ where: { email: EMAIL } });
    expect(stored.attempts).toBe(MAX_CODE_ATTEMPTS);
  });

  test('параллельные вводы на последней попытке дают ровно одно сравнение кода', async () => {
    // Arrange
    await service.requestCode(EMAIL);
    const wrong = lastCode(mail) === '000000' ? '111111' : '000000';
    await prisma.donorAuthCode.updateMany({ where: { email: EMAIL }, data: { attempts: MAX_CODE_ATTEMPTS - 1 } });
    const compare = jest.spyOn(loginCode, 'loginCodeMatches');

    try {
      // Act
      const results = await Promise.allSettled(Array.from({ length: 5 }, () => service.verify(EMAIL, wrong)));

      // Assert
      expect(results.every((result) => result.status === 'rejected')).toBe(true);
      expect(compare).toHaveBeenCalledTimes(1);
    } finally {
      compare.mockRestore();
    }
  });

  test('новый код гасит предыдущий', async () => {
    // Arrange
    await service.requestCode(EMAIL);
    const first = lastCode(mail);
    await service.requestCode(EMAIL, new Date(Date.now() + MINUTE_MS + 1_000));
    const second = lastCode(mail);

    // Act & Assert
    if (first !== second) {
      await expect(service.verify(EMAIL, first)).rejects.toBeInstanceOf(UnauthorizedException);
    }
    expect(await prisma.donorAuthCode.count({ where: { email: EMAIL, usedAt: null } })).toBe(1);
  });

  test('не больше пяти кодов на адрес за час', async () => {
    // Arrange: пять запросов с интервалом чуть больше минуты
    const start = Date.now();

    for (let index = 0; index < CODE_HOURLY_LIMIT; index += 1) {
      await service.requestCode(EMAIL, new Date(start + index * (MINUTE_MS + 1_000)));
    }

    // Act: шестой — внутри того же часа, но уже не раньше чем через минуту
    await service.requestCode(EMAIL, new Date(start + CODE_HOURLY_LIMIT * (MINUTE_MS + 1_000)));

    // Assert
    expect(mail.outbox()).toHaveLength(CODE_HOURLY_LIMIT);

    // Act: окно в час прошло
    await service.requestCode(EMAIL, new Date(start + 61 * MINUTE_MS + CODE_HOURLY_LIMIT * 1_000));

    // Assert
    expect(mail.outbox()).toHaveLength(CODE_HOURLY_LIMIT + 1);
  });

  test('параллельные запросы кода — одно письмо и одна строка', async () => {
    // Act
    await Promise.all(Array.from({ length: 5 }, () => service.requestCode(EMAIL)));

    // Assert
    expect(mail.outbox()).toHaveLength(1);
    expect(await prisma.donorAuthCode.count({ where: { email: EMAIL } })).toBe(1);
  });

  test('гард кабинета не пускает токен админки', async () => {
    // Arrange
    const adminToken = await new AccessTokenService(new JwtService({ secret: ADMIN_SECRET })).sign({ sub: 'admin-id', ver: 0 });
    const guard = new DonorJwtGuard(tokens, prisma);

    // Act & Assert
    await expect(guard.canActivate(contextFor(adminToken))).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
