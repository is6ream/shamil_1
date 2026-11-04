import { createHash } from 'node:crypto';

import { ConflictException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { AppConfig, DonorConfig } from '../../config/configuration';
import type { PrismaService } from '../../database/prisma.service';
import { createTestPrismaService, describeDatabase, resetDatabase } from '../../database/testing/test-database';
import type { DonorRequestMeta } from '../donor-auth.types';
import { DonorSessionService } from '../donor-session.service';
import { DonorTokenService } from '../donor-token.service';
import { VK_STATE_TTL_MS, VkAuthService, safeReturnTo } from './vk-auth.service';
import { buildVkAuthorizeUrl } from './vk-id.client';
import type { VkAuthorizeParams, VkExchangeParams, VkIdClient, VkUser } from './vk-id.client';

const DONOR: DonorConfig = {
  enabled: true,
  jwtSecret: 'donor-jwt-secret-'.padEnd(48, 'd'),
  hmacSecret: 'donor-hmac-secret-'.padEnd(48, 'h'),
  cookieSecure: false,
  vk: {
    clientId: '51234567',
    serviceToken: 'vk-service-token-'.padEnd(40, 's'),
    redirectUri: 'https://api.example.test/api/donor/auth/vk/callback',
  },
};
const META: DonorRequestMeta = { ip: '203.0.113.7', userAgent: 'jest' };
const VK_USER: VkUser = { userId: '1000001', firstName: 'Ильдар', lastName: 'Х.' };

/** VK без сети: запоминает, что у него спросили, и отдаёт заданного пользователя. */
class FakeVkClient implements VkIdClient {
  user: VkUser = VK_USER;
  readonly authorized: VkAuthorizeParams[] = [];
  readonly exchanged: VkExchangeParams[] = [];

  authorizeUrl(params: VkAuthorizeParams): string {
    this.authorized.push(params);

    return buildVkAuthorizeUrl(params);
  }

  fetchUser(params: VkExchangeParams): Promise<VkUser> {
    this.exchanged.push(params);

    return Promise.resolve(this.user);
  }
}

describe('safeReturnTo — только пути своего сайта', () => {
  test.each([
    ['/profile/settings', '/profile/settings'],
    ['/', '/'],
    ['//evil.example/profile', '/profile'],
    ['/\\evil.example', '/profile'],
    ['https://evil.example', '/profile'],
    ['profile', '/profile'],
    [undefined, '/profile'],
  ])('%s → %s', (input, expected) => {
    expect(safeReturnTo(input)).toBe(expected);
  });
});

describe('ссылка на форму VK ID', () => {
  test('несёт PKCE S256 и все обязательные параметры', () => {
    // Act
    const url = new URL(
      buildVkAuthorizeUrl({ clientId: '1', redirectUri: 'https://a.test/cb', state: 's'.repeat(43), codeChallenge: 'c' }),
    );

    // Assert
    expect(url.origin + url.pathname).toBe('https://id.vk.ru/authorize');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      response_type: 'code',
      client_id: '1',
      redirect_uri: 'https://a.test/cb',
      state: 's'.repeat(43),
      code_challenge: 'c',
      code_challenge_method: 'S256',
    });
  });
});

describeDatabase('вход через VK ID', () => {
  let prisma: PrismaService;
  let vk: FakeVkClient;
  let service: VkAuthService;

  beforeAll(() => {
    prisma = createTestPrismaService();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    vk = new FakeVkClient();
    const config = new ConfigService<AppConfig, true>({ donor: DONOR });
    service = new VkAuthService(prisma, new DonorSessionService(prisma, new DonorTokenService(config)), vk, config);
  });

  async function callbackFor(state: string, cookieState: string | null = state, now?: Date): ReturnType<VkAuthService['callback']> {
    return service.callback({ code: 'vk-code', state, deviceId: 'device-1', cookieState }, META, now);
  }

  test('code_challenge — SHA-256 от code_verifier, а verifier уходит только в обмен', async () => {
    // Arrange
    const started = await service.start('login', null, '/profile');

    // Act
    await callbackFor(started.state);

    // Assert
    const verifier = vk.exchanged[0]?.codeVerifier ?? '';
    expect(verifier).toMatch(/^[A-Za-z0-9_-]{43,128}$/);
    expect(vk.authorized[0]?.codeChallenge).toBe(createHash('sha256').update(verifier, 'ascii').digest('base64url'));
    expect(started.url).not.toContain(verifier);
    expect(vk.exchanged[0]?.serviceToken).toBe(DONOR.vk?.serviceToken);
  });

  test('первый вход создаёт кабинет без почты, с именем из VK и согласием', async () => {
    // Arrange
    const started = await service.start('login', null, '/profile/settings');

    // Act
    const result = await callbackFor(started.state);

    // Assert
    expect(result).toMatchObject({ purpose: 'login', returnTo: '/profile/settings' });
    const donor = await prisma.donorUser.findUniqueOrThrow({ where: { vkUserId: VK_USER.userId } });
    expect(donor.email).toBeNull();
    expect(donor.firstName).toBe('Ильдар');
    expect(donor.pdConsentAt).not.toBeNull();
  });

  test('повторный вход — тот же кабинет', async () => {
    // Arrange
    await callbackFor((await service.start('login', null, undefined)).state);

    // Act
    const second = await callbackFor((await service.start('login', null, undefined)).state);

    // Assert
    expect(second.purpose === 'login' && second.session.isNew).toBe(false);
    expect(await prisma.donorUser.count()).toBe(1);
  });

  test('state не совпал с cookie браузера — 401, в VK не ходим (login CSRF)', async () => {
    // Arrange
    const started = await service.start('login', null, undefined);

    // Act & Assert
    await expect(callbackFor(started.state, 'чужой-state')).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(callbackFor(started.state, null)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(vk.exchanged).toHaveLength(0);
  });

  test('state одноразовый', async () => {
    // Arrange
    const started = await service.start('login', null, undefined);
    await callbackFor(started.state);

    // Act & Assert
    await expect(callbackFor(started.state)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  test('через 10 минут state недействителен', async () => {
    // Arrange
    const started = await service.start('login', null, undefined);

    // Act & Assert
    await expect(callbackFor(started.state, started.state, new Date(Date.now() + VK_STATE_TTL_MS + 1000))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  test('привязка VK к кабинету по почте', async () => {
    // Arrange
    const donor = await prisma.donorUser.create({ data: { email: 'ivan@example.test' }, select: { id: true } });
    const started = await service.start('link', donor.id, '/profile/settings');

    // Act
    const result = await callbackFor(started.state);

    // Assert
    expect(result.purpose).toBe('link');
    const linked = await prisma.donorUser.findUniqueOrThrow({ where: { id: donor.id } });
    expect(linked.vkUserId).toBe(VK_USER.userId);
  });

  test('VK, уже привязанный к другому кабинету, не перехватывается — 409', async () => {
    // Arrange
    await prisma.donorUser.create({ data: { vkUserId: VK_USER.userId } });
    const donor = await prisma.donorUser.create({ data: { email: 'ivan@example.test' }, select: { id: true } });
    const started = await service.start('link', donor.id, undefined);

    // Act & Assert
    await expect(callbackFor(started.state)).rejects.toBeInstanceOf(ConflictException);
  });

  test('без настроек VK — 404', async () => {
    // Arrange
    const config = new ConfigService<AppConfig, true>({ donor: { ...DONOR, vk: null } });
    const disabled = new VkAuthService(prisma, new DonorSessionService(prisma, new DonorTokenService(config)), vk, config);

    // Act & Assert
    expect(disabled.isEnabled).toBe(false);
    await expect(disabled.start('login', null, undefined)).rejects.toBeInstanceOf(NotFoundException);
  });
});
