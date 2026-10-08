import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { ConflictException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import sharp from 'sharp';

import { AuditService } from '../audit/audit.service';
import type { AdminPrincipal, RequestMeta } from '../auth/auth.types';
import type { AppConfig } from '../config/configuration';
import type { PrismaService } from '../database/prisma.service';
import { CAMPAIGN_SLUG } from '../database/seed/campaign.data';
import {
  createTestAdmin,
  createTestPrismaService,
  describeDatabase,
  resetDatabase,
  seedFixtures,
} from '../database/testing/test-database';
import { AdminGalleryService } from '../gallery/admin-gallery.service';
import { RevalidationService } from '../revalidation/revalidation.service';
import { GalleryService } from '../showcase/gallery.service';
import { ImageProcessor } from './image-processor';
import { MediaUsageService } from './media-usage.service';
import { variantKeys } from './media-urls';
import { MediaService } from './media.service';
import { LocalStorage } from './storage/local-storage';

const META: RequestMeta = { ip: '127.0.0.1', userAgent: 'jest' };
const PUBLIC_BASE = 'http://localhost:3001/media';

describeDatabase('медиатека и галерея', () => {
  let prisma: PrismaService;
  let dir: string;
  let storage: LocalStorage;
  let media: MediaService;
  let gallery: AdminGalleryService;
  let actor: AdminPrincipal;

  jest.setTimeout(60_000);

  beforeAll(async () => {
    prisma = createTestPrismaService();
    dir = await mkdtemp(join(tmpdir(), 'shamil-media-'));
    storage = new LocalStorage(dir, PUBLIC_BASE);

    const audit = new AuditService(prisma);
    // Ревалидация выключена: секрета нет — запросов к сайту не будет.
    const revalidation = new RevalidationService(
      new ConfigService<AppConfig, true>({ revalidation: { url: 'http://127.0.0.1:9/api/revalidate' } }),
    );

    media = new MediaService(prisma, new ImageProcessor(), new MediaUsageService(), audit, storage);
    gallery = new AdminGalleryService(prisma, audit, revalidation, storage);
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await rm(dir, { recursive: true, force: true });
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    await seedFixtures(prisma, { campaignSlug: CAMPAIGN_SLUG });
    const admin = await createTestAdmin(prisma, { email: 'editor@example.test' });
    actor = { id: admin.id, email: admin.email, role: admin.role, displayName: null };
  });

  async function photo(): Promise<Buffer> {
    return sharp({ create: { width: 2400, height: 1600, channels: 3, background: '#0A3367' } }).jpeg().toBuffer();
  }

  test('загрузка кладёт три WebP в хранилище и строку в медиатеку с журналом', async () => {
    // Act
    const asset = await media.upload({ buffer: await photo(), originalname: 'фундамент.jpg' }, 'Заливка', actor, META);

    // Assert
    const row = await prisma.mediaAsset.findUniqueOrThrow({ where: { id: asset.id } });
    expect(row.originalName).toBe('фундамент.jpg');
    expect(asset.width).toBe(1920);
    expect(asset.urls.sm.startsWith(`${PUBLIC_BASE}/`)).toBe(true);
    expect(asset.url).toBe(asset.urls.lg);
    expect(variantKeys(row.storageKey).every((key) => existsSync(join(dir, key)))).toBe(true);
    expect(await prisma.auditLog.count({ where: { action: 'media.upload', entityId: asset.id } })).toBe(1);
  });

  test('используемый файл не удаляется — 409 со списком мест', async () => {
    // Arrange
    const asset = await media.upload({ buffer: await photo(), originalname: 'a.jpg' }, undefined, actor, META);
    await gallery.create({ mediaAssetId: asset.id, caption: 'Фундамент' }, actor, META);

    // Act
    const act = media.remove(asset.id, actor, META);

    // Assert
    await expect(act).rejects.toThrow(ConflictException);
    expect(await prisma.mediaAsset.count()).toBe(1);
  });

  test('неиспользуемый файл удаляется вместе с файлами в хранилище', async () => {
    // Arrange
    const asset = await media.upload({ buffer: await photo(), originalname: 'a.jpg' }, undefined, actor, META);
    const { storageKey } = await prisma.mediaAsset.findUniqueOrThrow({ where: { id: asset.id } });

    // Act
    await media.remove(asset.id, actor, META);

    // Assert
    expect(await prisma.mediaAsset.count()).toBe(0);
    expect(variantKeys(storageKey).some((key) => existsSync(join(dir, key)))).toBe(false);
  });

  test('фото из медиатеки появляется в публичной галерее; скрытое — нет', async () => {
    // Arrange
    const first = await media.upload({ buffer: await photo(), originalname: 'a.jpg' }, 'Сваи', actor, META);
    const second = await media.upload({ buffer: await photo(), originalname: 'b.jpg' }, undefined, actor, META);
    await gallery.create({ mediaAssetId: first.id, caption: 'Свайное поле', takenOn: '2026-07-01' }, actor, META);
    await gallery.create({ mediaAssetId: second.id, caption: 'Черновик', isPublished: false }, actor, META);

    // Act
    const items = await new GalleryService(prisma, storage).getGallery();

    // Assert
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      url: first.urls.lg,
      thumbUrl: first.urls.sm,
      caption: 'Свайное поле',
      takenAtLabel: 'июль 2026',
      width: 1920,
      height: 1280,
    });
  });

  test('порядок галереи меняется одним запросом и требует все строки', async () => {
    // Arrange
    const asset = await media.upload({ buffer: await photo(), originalname: 'a.jpg' }, undefined, actor, META);
    const a = await gallery.create({ mediaAssetId: asset.id, caption: 'A' }, actor, META);
    const b = await gallery.create({ mediaAssetId: asset.id, caption: 'B' }, actor, META);

    // Act
    const reordered = await gallery.reorder({ ids: [b.id, a.id] }, actor, META);

    // Assert
    expect(reordered.map((item) => item.caption)).toEqual(['B', 'A']);
    await expect(gallery.reorder({ ids: [a.id] }, actor, META)).rejects.toThrow(/ровно по одному/);
  });
});
