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

import { DonorAuthController } from './donor-auth.controller';
import { CODE_HOURLY_LIMIT, CODE_HOURLY_LIMIT_PER_IP, MAX_CODE_ATTEMPTS, PD_CONSENT_VERSION } from './donor-auth.constants';
import type { VkAuthService } from './vk/vk-auth.service';
import { DonorAuthService } from './donor-auth.service';
import type { DonorRequestMeta } from './donor-auth.types';
import { DonorCodeService } from './donor-code.service';
import { DonorJwtGuard } from './donor-jwt.guard';
import { DonorSessionService } from './donor-session.service';
import { DonorTokenService } from './donor-token.service';
import * as loginCode from './login-code';
import { hashLoginCode } from './login-code';

const DONOR: DonorConfig = {
  enabled: true,
  jwtSecret: 'donor-jwt-secret-'.padEnd(48, 'd'),
  hmacSecret: 'donor-hmac-secret-'.padEnd(48, 'h'),
  cookieSecure: false,
  vk: null,
};
const ADMIN_SECRET = 'admin-jwt-secret-'.padEnd(48, 'a');
const EMAIL = 'donor@example.test';
const META: DonorRequestMeta = { ip: '203.0.113.7', userAgent: 'jest' };
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

function later(minutes: number): Date {
  return new Date(Date.now() + minutes * MINUTE_MS);
}

describe('токены жертвователя и админки не взаимозаменяемы', () => {
  const donorTokens = new DonorTokenService(new ConfigService<AppConfig, true>({ donor: DONOR }));
  const adminTokens = new AccessTokenService(new JwtService({ secret: ADMIN_SECRET }));

  test('токен админки не проходит проверку кабинета', async () => {
    // Arrange
    const adminToken = await adminTokens.sign({ sub: 'admin-id', ver: 0 });

    // Act & Assert
    await expect(donorTokens.verify(adminToken)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  test('токен жертвователя не проходит проверку админки', async () => {
    // Arrange
    const donorToken = await donorTokens.sign({ sub: 'donor-id', sid: 'session-id' });

    // Act & Assert
    await expect(adminTokens.verify(donorToken)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  test('даже при одинаковом ключе админский aud не пускает токен жертвователя', async () => {
    // Arrange: худший случай — ключи совпали по ошибке конфигурации
    const sameKeyAdmin = new AccessTokenService(new JwtService({ secret: DONOR.jwtSecret }));
    const donorToken = await donorTokens.sign({ sub: 'donor-id', sid: 'session-id' });

    // Act & Assert
    await expect(sameKeyAdmin.verify(donorToken)).rejects.toBeInstanceOf(UnauthorizedException);
  });
});

describeDatabase('вход жертвователя по коду', () => {
  let prisma: PrismaService;
  let mail: LogMailSender;
  let tokens: DonorTokenService;
  let sessions: DonorSessionService;
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
    sessions = new DonorSessionService(prisma, tokens);
    service = new DonorAuthService(prisma, new DonorCodeService(prisma, mail, config), sessions);
  });

  async function signIn(at?: Date): Promise<Awaited<ReturnType<DonorAuthService['verify']>>> {
    await service.requestCode(EMAIL, META, at);

    return service.verify(EMAIL, lastCode(mail), META, at);
  }

  test('в базе хранится HMAC кода с назначением, а не сам код', async () => {
    // Act
    await service.requestCode(EMAIL, META);

    // Assert
    const code = lastCode(mail);
    const stored = await prisma.donorAuthCode.findFirstOrThrow({ where: { email: EMAIL } });
    expect(stored.codeHash).not.toContain(code);
    expect(stored.codeHash).toBe(hashLoginCode(DONOR.hmacSecret, 'login', EMAIL, code));
    expect(stored.ip).toBe(META.ip);
  });

  test('первый вход создаёт аккаунт и пишет согласие с версией, второй — нет', async () => {
    // Act
    const first = await signIn();
    const second = await signIn(later(2));

    // Assert
    expect(first.isNew).toBe(true);
    expect(second.isNew).toBe(false);
    expect(second.donor.id).toBe(first.donor.id);
    const donor = await prisma.donorUser.findUniqueOrThrow({ where: { id: first.donor.id } });
    expect(donor.pdConsentVersion).toBe(PD_CONSENT_VERSION);
    expect(donor.pdConsentAt).not.toBeNull();
    expect(await prisma.donorUser.count()).toBe(1);
  });

  test('код подтверждения почты для входа не годится', async () => {
    // Arrange: код другого назначения на тот же адрес
    const donor = await prisma.donorUser.create({ data: { vkUserId: '42' }, select: { id: true } });
    const config = new ConfigService<AppConfig, true>({ donor: DONOR });
    await new DonorCodeService(prisma, mail, config).issue(
      { purpose: 'change_email', email: EMAIL, donorId: donor.id },
      META.ip,
    );

    // Act & Assert
    await expect(service.verify(EMAIL, lastCode(mail), META)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  test('код одноразовый', async () => {
    // Arrange
    await service.requestCode(EMAIL, META);
    const code = lastCode(mail);
    await service.verify(EMAIL, code, META);

    // Act & Assert
    await expect(service.verify(EMAIL, code, META)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  test('после пяти неверных попыток не принимается даже верный код', async () => {
    // Arrange
    await service.requestCode(EMAIL, META);
    const code = lastCode(mail);
    const wrong = code === '000000' ? '111111' : '000000';

    for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt += 1) {
      await expect(service.verify(EMAIL, wrong, META)).rejects.toBeInstanceOf(UnauthorizedException);
    }

    // Act & Assert
    await expect(service.verify(EMAIL, code, META)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  test('код живёт 10 минут: на 9-й принимается, на 11-й — нет', async () => {
    // Arrange
    await service.requestCode(EMAIL, META);
    const code = lastCode(mail);

    // Act & Assert
    await expect(service.verify(EMAIL, code, META, later(11))).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(service.verify(EMAIL, code, META, later(9))).resolves.toMatchObject({ isNew: true });
  });

  test('повторный запрос раньше чем через минуту письма не шлёт', async () => {
    // Act
    await service.requestCode(EMAIL, META);
    await service.requestCode(EMAIL, META);

    // Assert
    expect(mail.outbox()).toHaveLength(1);
  });

  test('с одного IP не больше 20 писем в час, даже на разные адреса', async () => {
    // Act
    for (let index = 0; index <= CODE_HOURLY_LIMIT_PER_IP; index += 1) {
      await service.requestCode(`donor${index}@example.test`, META);
    }

    // Assert
    expect(mail.outbox()).toHaveLength(CODE_HOURLY_LIMIT_PER_IP);
  });

  test('refresh ротируется: новый токен работает, старый повторно — отзывает сессию', async () => {
    // Arrange
    const session = await signIn();

    // Act
    const rotated = await service.refresh(session.refreshToken, META);

    // Assert
    expect(rotated.refreshToken).not.toBe(session.refreshToken);
    await expect(service.refresh(session.refreshToken, META)).rejects.toBeInstanceOf(UnauthorizedException);
    // Повтор старого токена — признак кражи: свежий токен тоже погашен.
    await expect(service.refresh(rotated.refreshToken, META)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  test('выход гасит сессию этого устройства сразу, другие живут', async () => {
    // Arrange
    const phone = await signIn();
    const laptop = await signIn(later(2));
    const guard = new DonorJwtGuard(tokens, sessions);
    await expect(guard.canActivate(contextFor(phone.accessToken))).resolves.toBe(true);

    // Act
    await service.logout(phone.refreshToken);

    // Assert
    await expect(guard.canActivate(contextFor(phone.accessToken))).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(service.refresh(phone.refreshToken, META)).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(guard.canActivate(contextFor(laptop.accessToken))).resolves.toBe(true);
  });

  test('удалённый аккаунт не входит и не обновляет сессию', async () => {
    // Arrange
    const session = await signIn();
    await prisma.donorUser.update({ where: { id: session.donor.id }, data: { email: null, deletedAt: new Date() } });
    const guard = new DonorJwtGuard(tokens, sessions);

    // Act & Assert
    await expect(guard.canActivate(contextFor(session.accessToken))).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(service.refresh(session.refreshToken, META)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  test('в базе только SHA-256 refresh-токена', async () => {
    // Act
    const session = await signIn();

    // Assert
    const stored = await prisma.donorRefreshToken.findFirstOrThrow();
    expect(stored.tokenHash).toHaveLength(64);
    expect(stored.tokenHash).not.toBe(session.refreshToken);
  });

  test('гард админки не пускает токен жертвователя', async () => {
    // Arrange
    const session = await signIn();
    const adminGuard = new JwtAuthGuard(new AccessTokenService(new JwtService({ secret: ADMIN_SECRET })), prisma);

    // Act & Assert
    await expect(adminGuard.canActivate(contextFor(session.accessToken))).rejects.toBeInstanceOf(UnauthorizedException);
  });
  test('ответ на запрос кода одинаков для нового и уже известного адреса', async () => {
    // Arrange
    const known = 'known@example.test';
    await prisma.donorUser.create({ data: { email: known } });
    const controller = new DonorAuthController(service, {} as VkAuthService, new ConfigService<AppConfig, true>({ donor: DONOR, publicUrls: { siteUrl: 'http://localhost:3000' } }));

    // Act
    const forKnown = await controller.requestCode({ email: known }, { headers: {} });
    const forNew = await controller.requestCode({ email: EMAIL }, { headers: {} });

    // Assert: тело одно и то же, аккаунт по запросу кода не создаётся
    expect(forNew).toEqual(forKnown);
    expect(await prisma.donorUser.count({ where: { email: EMAIL } })).toBe(0);
    expect(mail.outbox()).toHaveLength(2);
  });

  test('шестая попытка отклоняется и счётчик не растёт выше лимита', async () => {
    // Arrange
    await service.requestCode(EMAIL, META);
    const code = lastCode(mail);
    const wrong = code === '000000' ? '111111' : '000000';

    for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt += 1) {
      await expect(service.verify(EMAIL, wrong, META)).rejects.toBeInstanceOf(UnauthorizedException);
    }

    // Act & Assert
    await expect(service.verify(EMAIL, wrong, META)).rejects.toBeInstanceOf(UnauthorizedException);
    const stored = await prisma.donorAuthCode.findFirstOrThrow({ where: { email: EMAIL } });
    expect(stored.attempts).toBe(MAX_CODE_ATTEMPTS);
  });

  test('параллельные вводы на последней попытке дают ровно одно сравнение кода', async () => {
    // Arrange
    await service.requestCode(EMAIL, META);
    const wrong = lastCode(mail) === '000000' ? '111111' : '000000';
    await prisma.donorAuthCode.updateMany({ where: { email: EMAIL }, data: { attempts: MAX_CODE_ATTEMPTS - 1 } });
    const compare = jest.spyOn(loginCode, 'loginCodeMatches');

    try {
      // Act
      const results = await Promise.allSettled(Array.from({ length: 5 }, () => service.verify(EMAIL, wrong, META)));

      // Assert
      expect(results.every((result) => result.status === 'rejected')).toBe(true);
      expect(compare).toHaveBeenCalledTimes(1);
    } finally {
      compare.mockRestore();
    }
  });

  test('новый код гасит предыдущий', async () => {
    // Arrange
    await service.requestCode(EMAIL, META);
    const first = lastCode(mail);
    await service.requestCode(EMAIL, META, new Date(Date.now() + MINUTE_MS + 1_000));
    const second = lastCode(mail);

    // Act & Assert
    if (first !== second) {
      await expect(service.verify(EMAIL, first, META)).rejects.toBeInstanceOf(UnauthorizedException);
    }
    expect(await prisma.donorAuthCode.count({ where: { email: EMAIL, usedAt: null } })).toBe(1);
  });

  test('не больше пяти кодов на адрес за час', async () => {
    // Arrange: пять запросов с интервалом чуть больше минуты
    const start = Date.now();

    for (let index = 0; index < CODE_HOURLY_LIMIT; index += 1) {
      await service.requestCode(EMAIL, META, new Date(start + index * (MINUTE_MS + 1_000)));
    }

    // Act: шестой — внутри того же часа, но уже не раньше чем через минуту
    await service.requestCode(EMAIL, META, new Date(start + CODE_HOURLY_LIMIT * (MINUTE_MS + 1_000)));

    // Assert
    expect(mail.outbox()).toHaveLength(CODE_HOURLY_LIMIT);

    // Act: окно в час прошло
    await service.requestCode(EMAIL, META, new Date(start + 61 * MINUTE_MS + CODE_HOURLY_LIMIT * 1_000));

    // Assert
    expect(mail.outbox()).toHaveLength(CODE_HOURLY_LIMIT + 1);
  });

  test('параллельные запросы кода — одно письмо и одна строка', async () => {
    // Act
    await Promise.all(Array.from({ length: 5 }, () => service.requestCode(EMAIL, META)));

    // Assert
    expect(mail.outbox()).toHaveLength(1);
    expect(await prisma.donorAuthCode.count({ where: { email: EMAIL } })).toBe(1);
  });

  test('гард кабинета не пускает токен админки', async () => {
    // Arrange
    const adminToken = await new AccessTokenService(new JwtService({ secret: ADMIN_SECRET })).sign({ sub: 'admin-id', ver: 0 });
    const guard = new DonorJwtGuard(tokens, sessions);

    // Act & Assert
    await expect(guard.canActivate(contextFor(adminToken))).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
