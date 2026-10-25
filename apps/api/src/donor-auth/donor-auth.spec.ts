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
import { MAX_CODE_ATTEMPTS } from './donor-auth.constants';
import { DonorAuthService } from './donor-auth.service';
import { DonorJwtGuard } from './donor-jwt.guard';
import { DonorTokenService } from './donor-token.service';
import { hashLoginCode } from './login-code';

const DONOR: DonorConfig = {
  enabled: true,
  jwtSecret: 'donor-jwt-secret-'.padEnd(48, 'd'),
  hmacSecret: 'donor-hmac-secret-'.padEnd(48, 'h'),
  cookieSecure: false,
};
const ADMIN_SECRET = 'admin-jwt-secret-'.padEnd(48, 'a');
const EMAIL = 'donor@example.test';

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
});
