import { ConflictException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { AuditService } from '../audit/audit.service';
import type { AdminPrincipal, RequestMeta } from '../auth/auth.types';
import type { AppConfig } from '../config/configuration';
import type { PrismaService } from '../database/prisma.service';
import {
  createTestAdmin,
  createTestPrismaService,
  describeDatabase,
  resetDatabase,
} from '../database/testing/test-database';
import { isPreviewBot, ShortLinksService } from './short-links.service';

const SITE_URL = 'https://mechetshamil.ru';
const HOME = `${SITE_URL}/`;
const BROWSER_UA = 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36';
const META: RequestMeta = { ip: '127.0.0.1', userAgent: 'jest' };

describe('isPreviewBot', () => {
  test.each([
    'TelegramBot (like TwitterBot)',
    'WhatsApp/2.23.20.0 A',
    'facebookexternalhit/1.1',
    'vkShare; +http://vk.com/dev/Share',
    'Mozilla/5.0 (compatible; YandexBot/3.0)',
    'Googlebot/2.1',
    'curl/8.4.0',
    '',
  ])('«%s» — бот: клик не считаем', (userAgent) => {
    // Act & Assert
    expect(isPreviewBot(userAgent)).toBe(true);
  });

  test('без user-agent — не считаем', () => {
    // Act & Assert
    expect(isPreviewBot(undefined)).toBe(true);
  });

  test.each([
    BROWSER_UA,
    // Встроенные браузеры мессенджеров — это люди, а не превью.
    'Mozilla/5.0 (Linux; Android 13) Telegram-Android/10.0',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) Instagram 300.0',
    'Mozilla/5.0 (Linux; Android 12) Viber/20.1',
  ])('«%s» — человек', (userAgent) => {
    // Act & Assert
    expect(isPreviewBot(userAgent)).toBe(false);
  });
});

describeDatabase('ShortLinksService', () => {
  let prisma: PrismaService;
  let service: ShortLinksService;
  let actor: AdminPrincipal;

  beforeAll(() => {
    prisma = createTestPrismaService();
    service = new ShortLinksService(
      prisma,
      new AuditService(prisma),
      new ConfigService<AppConfig, true>({ publicUrls: { siteUrl: SITE_URL, apiUrl: 'https://api.mechetshamil.ru' } }),
    );
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    const admin = await createTestAdmin(prisma);

    actor = { ...admin, displayName: null };
  });

  async function createLink(overrides: Partial<Parameters<ShortLinksService['create']>[0]> = {}): Promise<string> {
    const link = await service.create(
      { slug: 'banner-mosque', title: 'Баннер у входа', utmSource: 'qr', utmMedium: 'offline', ...overrides },
      actor,
      META,
    );

    return link.id;
  }

  async function clicks(slug = 'banner-mosque'): Promise<number> {
    const row = await prisma.shortLink.findUniqueOrThrow({ where: { slug }, select: { clicks: true } });

    return row.clicks;
  }

  test('редирект ведёт на страницу сайта с метками и считает клик человека', async () => {
    // Arrange
    await createLink({ targetPath: '/02/', utmCampaign: 'ramadan-2026' });

    // Act
    const location = await service.resolveRedirect('banner-mosque', BROWSER_UA);

    // Assert
    expect(location).toBe(`${SITE_URL}/02/?utm_source=qr&utm_medium=offline&utm_campaign=ramadan-2026`);
    expect(await clicks()).toBe(1);
  });

  test('превью-бот получает тот же адрес, но клик не засчитывается', async () => {
    // Arrange
    await createLink();

    // Act
    const location = await service.resolveRedirect('banner-mosque', 'TelegramBot (like TwitterBot)');

    // Assert
    expect(location).toBe(`${SITE_URL}/?utm_source=qr&utm_medium=offline`);
    expect(await clicks()).toBe(0);
  });

  test('одновременные клики не теряются: инкремент атомарный', async () => {
    // Arrange
    await createLink();

    // Act
    await Promise.all(Array.from({ length: 20 }, () => service.resolveRedirect('banner-mosque', BROWSER_UA)));

    // Assert
    expect(await clicks()).toBe(20);
  });

  test.each([
    ['несуществующий слаг', 'no-such-link'],
    ['слаг недопустимого формата', '../admin'],
    ['слаг с заглавными', 'Banner-Mosque'],
  ])('%s → главная, без ошибки', async (_case, slug) => {
    // Arrange
    await createLink();

    // Act & Assert
    await expect(service.resolveRedirect(slug, BROWSER_UA)).resolves.toBe(HOME);
  });

  test('выключенная ссылка ведёт на главную и клик не считает', async () => {
    // Arrange
    await createLink({ isActive: false });

    // Act
    const location = await service.resolveRedirect('banner-mosque', BROWSER_UA);

    // Assert
    expect(location).toBe(HOME);
    expect(await clicks()).toBe(0);
  });

  test('повторный слаг — 409', async () => {
    // Arrange
    await createLink();

    // Act & Assert
    await expect(createLink()).rejects.toBeInstanceOf(ConflictException);
  });

  test('ссылку без кликов можно удалить, и это пишется в журнал', async () => {
    // Arrange
    const id = await createLink();

    // Act
    await service.remove(id, actor, META);

    // Assert
    expect(await prisma.shortLink.count()).toBe(0);
    expect(await prisma.auditLog.count({ where: { action: 'short_link.delete', entityId: id } })).toBe(1);
  });

  test('ссылку с кликами удалить нельзя — только выключить', async () => {
    // Arrange
    const id = await createLink();
    await service.resolveRedirect('banner-mosque', BROWSER_UA);

    // Act & Assert
    await expect(service.remove(id, actor, META)).rejects.toBeInstanceOf(ConflictException);
    expect(await prisma.shortLink.count()).toBe(1);
  });

  test('правка стирает метку пустым значением и меняет путь', async () => {
    // Arrange
    const id = await createLink({ utmCampaign: 'old' });

    // Act
    const updated = await service.update(id, { utmCampaign: null, targetPath: '/novosti/' }, actor, META);

    // Assert
    expect(updated.utm.campaign).toBeNull();
    expect(updated.targetUrl).toBe(`${SITE_URL}/novosti/?utm_source=qr&utm_medium=offline`);
    expect(updated.shortUrl).toBe(`${SITE_URL}/go/banner-mosque`);
  });

  test('правка несуществующей ссылки — 404', async () => {
    // Act & Assert
    await expect(
      service.update('00000000-0000-4000-8000-000000000001', { title: 'x' }, actor, META),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  test('база не пустит путь, похожий на чужой домен, даже в обход DTO', async () => {
    // Act & Assert
    await expect(
      prisma.shortLink.create({ data: { slug: 'evil', title: 'x', utmSource: 'qr', targetPath: '//evil.example' } }),
    ).rejects.toThrow(/short_link_target_path_format/);
  });
});
