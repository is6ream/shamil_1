import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { AuditService } from '../audit/audit.service';
import type { AdminPrincipal, RequestMeta } from '../auth/auth.types';
import type { AppConfig } from '../config/configuration';
import type { PrismaService } from '../database/prisma.service';
import { HERO_SEED, STAGES_SEED } from '../database/seed/content.data';
import { seedContent } from '../database/seed/content.seed';
import { createTestAdmin, createTestPrismaService, describeDatabase, resetDatabase } from '../database/testing/test-database';
import { ConstructionStageStatus, NewsStatus } from '../generated/prisma/enums';
import { MediaUsageService } from '../media/media-usage.service';
import { LocalStorage } from '../media/storage/local-storage';
import { RevalidationService } from '../revalidation/revalidation.service';
import { ContentService } from './content.service';
import { NewsService } from './news.service';
import { StagesService } from './stages.service';

const META: RequestMeta = { ip: '127.0.0.1', userAgent: 'jest' };
const STORAGE = new LocalStorage('uploads', 'http://localhost:3001/media');

describeDatabase('контент сайта', () => {
  let prisma: PrismaService;
  let content: ContentService;
  let stages: StagesService;
  let news: NewsService;
  let actor: AdminPrincipal;

  jest.setTimeout(30_000);

  beforeAll(() => {
    prisma = createTestPrismaService();
    const audit = new AuditService(prisma);
    const revalidation = new RevalidationService(
      new ConfigService<AppConfig, true>({ revalidation: { url: 'http://127.0.0.1:9/api/revalidate' } }),
    );

    content = new ContentService(prisma, audit, revalidation, STORAGE);
    stages = new StagesService(prisma, audit, revalidation, STORAGE);
    news = new NewsService(prisma, audit, revalidation, STORAGE);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    const admin = await createTestAdmin(prisma);
    actor = { id: admin.id, email: admin.email, role: admin.role, displayName: null };
  });

  async function mediaAsset(): Promise<string> {
    const asset = await prisma.mediaAsset.create({
      data: {
        storageKey: '2026/10/00000000-0000-4000-8000-0000000000aa',
        variants: [],
        width: 1920,
        height: 1080,
        bytes: 1000,
      },
    });

    return asset.id;
  }

  test('сид переносит хардкод фронта и не перетирает правки при повторе', async () => {
    // Arrange
    await seedContent(prisma);
    await content.update('hero', { ...HERO_SEED, title: 'Новый заголовок' }, actor, META);

    // Act
    const second = await seedContent(prisma);
    const publicContent = await content.getPublic();
    const construction = await stages.getPublic();

    // Assert
    expect(second).toEqual({ blocksCreated: 0, stagesCreated: 0 });
    expect(publicContent.hero?.title).toBe('Новый заголовок');
    expect(publicContent.hero?.renderUrl).toBeNull();
    expect(publicContent.contacts?.email).toBe('mosqueshamil@gmail.com');
    expect(publicContent.requisites?.accountNumber).toBeNull();
    expect(construction.stages.map((stage) => stage.title)).toEqual(STAGES_SEED.map((stage) => stage.title));
    expect(construction.stages[2]).toMatchObject({ status: 'current', amountKopecks: '5400000000' });
  });

  test('картинка блока из медиатеки отдаётся сайту ссылкой', async () => {
    // Arrange
    const mediaId = await mediaAsset();

    // Act
    await content.update('hero', { ...HERO_SEED, renderMediaId: mediaId }, actor, META);

    // Assert
    const publicContent = await content.getPublic();
    expect(publicContent.hero?.renderUrl).toBe(`http://localhost:3001/media/2026/10/00000000-0000-4000-8000-0000000000aa-lg.webp`);
    expect(publicContent.hero?.render?.width).toBe(1920);
  });

  test('ссылка на несуществующую картинку — 400', async () => {
    // Act
    const act = content.update('hero', { ...HERO_SEED, renderMediaId: '00000000-0000-4000-8000-000000000999' }, actor, META);

    // Assert
    await expect(act).rejects.toThrow(BadRequestException);
  });

  test('картинка, стоящая в блоке, считается использованной', async () => {
    // Arrange
    const mediaId = await mediaAsset();
    await content.update('hero', { ...HERO_SEED, renderMediaId: mediaId }, actor, META);

    // Act
    const usages = await prisma.$transaction((tx) => new MediaUsageService().findUsages(tx, mediaId));

    // Assert
    expect(usages).toEqual([{ entityType: 'content_block', entityId: 'hero', label: 'Блок «hero»' }]);
  });

  test('правка этапа сразу видна в публичном ходе строительства, с фото', async () => {
    // Arrange
    const mediaId = await mediaAsset();
    const stage = await stages.create({ title: 'Фундамент', budgetKopecks: '100000' }, actor, META);

    // Act
    await stages.update(
      stage.id,
      { status: ConstructionStageStatus.done, spentKopecks: '99000', photoMediaIds: [mediaId] },
      actor,
      META,
    );

    // Assert
    const construction = await stages.getPublic();
    expect(construction.stages[0]).toMatchObject({
      title: 'Фундамент',
      status: 'done',
      amountKopecks: '100000',
      spentKopecks: '99000',
    });
    expect(construction.stages[0]?.photos).toHaveLength(1);
    expect(construction.updatedAt).not.toBeNull();
    const entry = await prisma.auditLog.findFirstOrThrow({ where: { action: 'stage.update' } });
    expect(entry.after).toMatchObject({ status: 'done', spentKopecks: '99000' });
  });

  test('сумма этапа сверх потолка — 400', async () => {
    // Act
    const act = stages.create({ title: 'X', budgetKopecks: '99999999999999' }, actor, META);

    // Assert
    await expect(act).rejects.toThrow(BadRequestException);
  });

  test('черновик не виден на сайте, публикация — видна с датой', async () => {
    // Arrange
    const draft = await news.create({ title: 'Залили фундамент', bodyMarkdown: 'Текст' }, actor, META);

    // Act & Assert
    expect(draft.slug).toBe('zalili-fundament');
    expect((await news.listPublished({ page: 1, pageSize: 10 })).total).toBe(0);
    await expect(news.getPublished(draft.slug)).rejects.toThrow(NotFoundException);

    const published = await news.update(draft.id, { status: NewsStatus.published }, actor, META);

    expect(published.publishedAt).not.toBeNull();
    expect((await news.getPublished(draft.slug)).bodyMarkdown).toBe('Текст');
    expect(await prisma.auditLog.count({ where: { action: 'news.publish' } })).toBe(1);

    await news.update(draft.id, { status: NewsStatus.draft }, actor, META);
    await expect(news.getPublished(draft.slug)).rejects.toThrow(NotFoundException);
  });

  test('одинаковые заголовки получают разные слаги; явный дубль — 409', async () => {
    // Arrange
    const first = await news.create({ title: 'Отчёт', bodyMarkdown: 'a' }, actor, META);

    // Act
    const second = await news.create({ title: 'Отчёт', bodyMarkdown: 'b' }, actor, META);

    // Assert
    expect([first.slug, second.slug]).toEqual(['otchet', 'otchet-2']);
    await expect(news.create({ title: 'Иное', slug: 'otchet', bodyMarkdown: 'c' }, actor, META)).rejects.toThrow(
      ConflictException,
    );
  });

  test('HTML в тексте новости — 400', async () => {
    // Act
    const act = news.create({ title: 'XSS', bodyMarkdown: '<img src=x onerror=alert(1)>' }, actor, META);

    // Assert
    await expect(act).rejects.toThrow(BadRequestException);
  });
});
