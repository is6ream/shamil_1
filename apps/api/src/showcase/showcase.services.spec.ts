import { BadRequestException, NotFoundException } from '@nestjs/common';

import { CAMPAIGN_SLUG } from '../database/seed/campaign.data';
import type { PrismaService } from '../database/prisma.service';
import {
  TEST_MONTHLY_GOAL_KOPECKS,
  TEST_PAID_AT,
  createPendingDonation,
  createTestPrismaService,
  describeDatabase,
  markPaid,
  resetDatabase,
  seedFixtures,
} from '../database/testing/test-database';
import type { TestFixtures } from '../database/testing/test-database';
import { CampaignService } from './campaign.service';
import { DonorsService } from './donors.service';
import { encodeFeedCursor } from './feed-cursor';
import { FeedService } from './feed.service';
import { LocalStorage } from '../media/storage/local-storage';
import { GalleryService } from './gallery.service';
import { RegionsService } from './regions.service';

/**
 * Витрина на реальном PostgreSQL: цифры приходят из таблиц, которые пишет
 * триггер `donation_stats_sync`, и проверять их на моках бессмысленно.
 */
describeDatabase('витринные эндпоинты', () => {
  let prisma: PrismaService;
  let fixtures: TestFixtures;

  beforeAll(() => {
    prisma = createTestPrismaService();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    fixtures = await seedFixtures(prisma, { campaignSlug: CAMPAIGN_SLUG });
  });

  /** Оплаченный донат с публичной подписью — как после вебхука. */
  async function paidDonation(options: {
    amountKopecks: bigint;
    paidAt?: Date;
    regionId?: string;
    donorName?: string;
  }): Promise<string> {
    const donation = await prisma.donation.create({
      data: {
        campaignId: fixtures.campaignId,
        amountKopecks: options.amountKopecks,
        regionId: options.regionId,
        regionSource: options.regionId === undefined ? undefined : 'form',
        isAnonymous: options.donorName === undefined,
        donorName: options.donorName,
        method: 'sbp',
        contact: {
          create: { phoneE164: '+79991234567', fullName: 'Секретное Имя', personalDataConsentAt: new Date() },
        },
      },
      select: { id: true },
    });

    await markPaid(prisma, donation.id, options.amountKopecks, options.paidAt ?? TEST_PAID_AT);

    return donation.id;
  }

  describe('GET /campaign', () => {
    test('до первого платежа — нули и цель месяца текущего периода', async () => {
      // Act
      const campaign = await new CampaignService(prisma).getCampaign(TEST_PAID_AT);

      // Assert
      expect(campaign).toEqual({
        goalKopecks: '24000000000',
        collectedKopecks: '0',
        donationsCount: 0,
        lastPaidAt: null,
        monthlyGoal: {
          goalKopecks: TEST_MONTHLY_GOAL_KOPECKS.toString(),
          collectedKopecks: '0',
          periodStart: '2026-08-31T21:00:00.000Z',
          periodEnd: '2026-09-30T20:59:59.999Z',
        },
      });
    });

    test('оплата двигает общую сумму, число платежей и цель месяца', async () => {
      // Arrange
      await paidDonation({ amountKopecks: 10_000n });
      await paidDonation({ amountKopecks: 50_000n });

      // Act
      const campaign = await new CampaignService(prisma).getCampaign(TEST_PAID_AT);

      // Assert
      expect(campaign.collectedKopecks).toBe('60000');
      expect(campaign.donationsCount).toBe(2);
      expect(campaign.lastPaidAt).toBe(TEST_PAID_AT.toISOString());
      expect(campaign.monthlyGoal?.collectedKopecks).toBe('60000');
    });

    test('вне периода цели месяца — null, а не нули', async () => {
      // Act — октябрь, а цель в тестах только на сентябрь
      const campaign = await new CampaignService(prisma).getCampaign(new Date('2026-10-15T09:00:00Z'));

      // Assert
      expect(campaign.monthlyGoal).toBeNull();
    });

    test('в 01:00 МСК первого октября сентябрьская цель уже не показывается', async () => {
      // Act — 2026-10-01 01:00 МСК = 2026-09-30 22:00 UTC
      const campaign = await new CampaignService(prisma).getCampaign(new Date('2026-09-30T22:00:00Z'));

      // Assert
      expect(campaign.monthlyGoal).toBeNull();
    });

    test('сбора со слагом приложения нет — 404', async () => {
      // Arrange
      await prisma.campaign.update({ where: { id: fixtures.campaignId }, data: { isActive: false } });

      // Act & Assert
      await expect(new CampaignService(prisma).getCampaign()).rejects.toThrow(NotFoundException);
    });
  });

  describe('GET /regions', () => {
    test('только активные, по индексу (type, sort_order, name), Россия в списке', async () => {
      // Arrange
      await prisma.region.update({ where: { id: fixtures.kazakhstanId }, data: { isActive: false } });

      // Act
      const regions = await new RegionsService(prisma).getRegions();

      // Assert
      expect(regions.map((region) => region.slug)).toEqual(['ru', '02']);
      expect(regions[0]).toEqual({ slug: 'ru', code: 'RU', name: 'Россия', type: 'country', flagUrl: null });
      expect(regions[1]?.code).toBe('02');
    });
  });

  describe('GET /regions/top', () => {
    test('только регионы с поступлениями, по убыванию; Россия не ранжируется', async () => {
      // Arrange
      await paidDonation({ amountKopecks: 10_000n, regionId: fixtures.bashkortostanId });
      await paidDonation({ amountKopecks: 20_000n, regionId: fixtures.bashkortostanId });
      await paidDonation({ amountKopecks: 50_000n, regionId: fixtures.kazakhstanId });
      await paidDonation({ amountKopecks: 90_000n, regionId: fixtures.russiaId });

      // Act
      const top = await new RegionsService(prisma).getTopRegions();

      // Assert
      expect(top.items).toEqual([
        { slug: 'kz', name: 'Казахстан', flagUrl: null, donorsCount: 1, paidTotalKopecks: '50000' },
        { slug: '02', name: 'Республика Башкортостан', flagUrl: null, donorsCount: 2, paidTotalKopecks: '30000' },
      ]);
      expect(top.emptyCount).toBe(0);
    });

    test('пустые ранжируемые регионы считаются, неранжируемые и выключенные — нет', async () => {
      // Arrange
      await paidDonation({ amountKopecks: 10_000n, regionId: fixtures.kazakhstanId });

      // Act
      const top = await new RegionsService(prisma).getTopRegions();

      // Assert — Башкортостан пуст; Россия пустая, но не ранжируется
      expect(top.items).toHaveLength(1);
      expect(top.emptyCount).toBe(1);
    });

    test('pending в рейтинг не попадает', async () => {
      // Arrange
      await createPendingDonation(prisma, fixtures, { regionId: fixtures.bashkortostanId });

      // Act
      const top = await new RegionsService(prisma).getTopRegions();

      // Assert
      expect(top.items).toEqual([]);
      expect(top.emptyCount).toBe(2);
    });
  });

  describe('GET /donors/top', () => {
    test('только оплаченные и подписанные, по одному платежу, по убыванию', async () => {
      // Arrange
      await paidDonation({ amountKopecks: 10_000n, donorName: 'Айгуль' });
      await paidDonation({ amountKopecks: 500_000n, donorName: 'Наиль Х.' });
      await paidDonation({ amountKopecks: 900_000n });
      await createPendingDonation(prisma, fixtures, { amountKopecks: 1_000_000n });

      // Act
      const donors = await new DonorsService(prisma).getTopDonors();

      // Assert
      expect(donors).toEqual([
        { donorName: 'Наиль Х.', paidAmountKopecks: '500000' },
        { donorName: 'Айгуль', paidAmountKopecks: '10000' },
      ]);
    });
  });

  describe('GET /donations/feed', () => {
    test('новые сверху; две страницы при одинаковом paid_at — без пропусков и дублей', async () => {
      // Arrange — пять донатов в одну миллисекунду и один позже
      const sameMoment = new Date('2026-09-20T10:00:00.000Z');
      const sameIds: string[] = [];
      for (let index = 0; index < 5; index += 1) {
        sameIds.push(await paidDonation({ amountKopecks: 10_000n, paidAt: sameMoment }));
      }
      const newest = await paidDonation({ amountKopecks: 20_000n, paidAt: new Date('2026-09-21T10:00:00Z') });
      const feed = new FeedService(prisma);

      // Act
      const first = await feed.getPage({ limit: 3 });
      const second = await feed.getPage({ limit: 3, cursor: first.nextCursor ?? undefined });

      // Assert
      const firstIds = first.items.map((item) => item.id);
      const secondIds = second.items.map((item) => item.id);
      expect(firstIds[0]).toBe(newest);
      expect(new Set([...firstIds, ...secondIds]).size).toBe(6);
      expect([...firstIds, ...secondIds].sort()).toEqual([newest, ...sameIds].sort());
      expect(first.nextCursor).not.toBeNull();
      expect(second.nextCursor).toBeNull();
    });

    test('лимит по умолчанию — 6 строк', async () => {
      // Arrange
      for (let index = 0; index < 7; index += 1) {
        await paidDonation({ amountKopecks: 10_000n });
      }

      // Act
      const page = await new FeedService(prisma).getPage();

      // Assert
      expect(page.items).toHaveLength(6);
      expect(page.nextCursor).not.toBeNull();
    });

    test('анонимный без подписи, подписанный с подписью; ПДн нет ни в ключах, ни в значениях', async () => {
      // Arrange
      await paidDonation({ amountKopecks: 10_000n, regionId: fixtures.bashkortostanId, paidAt: new Date('2026-09-20T10:00:00Z') });
      await paidDonation({ amountKopecks: 20_000n, donorName: 'Айгуль', paidAt: new Date('2026-09-21T10:00:00Z') });

      // Act
      const page = await new FeedService(prisma).getPage();

      // Assert
      const [signed, anonymous] = page.items;
      expect(signed).toMatchObject({ donorName: 'Айгуль', amountKopecks: '20000', method: 'sbp', regionName: null });
      expect(anonymous).toMatchObject({ donorName: null, regionName: 'Республика Башкортостан' });
      for (const item of page.items) {
        expect(Object.keys(item).sort()).toEqual(
          ['amountKopecks', 'donorName', 'id', 'method', 'paidAt', 'regionName'].sort(),
        );
      }
      const serialized = JSON.stringify(page);
      expect(serialized).not.toContain('+79991234567');
      expect(serialized).not.toContain('Секретное Имя');
    });

    test('pending в ленту не попадает', async () => {
      // Arrange
      await createPendingDonation(prisma, fixtures);

      // Act & Assert
      expect((await new FeedService(prisma).getPage()).items).toEqual([]);
    });

    test('битый курсор — 400, а не 500', async () => {
      await expect(new FeedService(prisma).getPage({ cursor: 'мусор' })).rejects.toThrow(BadRequestException);
    });

    test('курсор после последней строки — пустая страница', async () => {
      // Arrange
      await paidDonation({ amountKopecks: 10_000n });
      const cursor = encodeFeedCursor({ paidAt: new Date('2000-01-01T00:00:00Z'), id: '00000000-0000-4000-8000-000000000000' });

      // Act & Assert
      expect(await new FeedService(prisma).getPage({ cursor })).toEqual({ items: [], nextCursor: null });
    });
  });

  describe('GET /gallery', () => {
    test('только опубликованные, по sort_order, затем хронологически', async () => {
      // Arrange
      await prisma.galleryItem.createMany({
        data: [
          { campaignId: fixtures.campaignId, imageUrl: '/c.webp', caption: 'Стены', takenOn: new Date(Date.UTC(2026, 7, 1)) },
          { campaignId: fixtures.campaignId, imageUrl: '/a.webp', caption: 'Фундамент', takenOn: new Date(Date.UTC(2026, 5, 1)) },
          { campaignId: fixtures.campaignId, imageUrl: '/b.webp', altText: 'Опалубка', takenOn: new Date(Date.UTC(2026, 6, 1)) },
          { campaignId: fixtures.campaignId, imageUrl: '/hidden.webp', caption: 'Черновик', isPublished: false },
        ],
      });

      // Act
      const gallery = await new GalleryService(prisma, new LocalStorage('uploads', 'http://localhost:3001/media')).getGallery();

      // Assert
      expect(gallery.map(({ url, caption, takenAtLabel }) => ({ url, caption, takenAtLabel }))).toEqual([
        { url: '/a.webp', caption: 'Фундамент', takenAtLabel: 'июнь 2026' },
        { url: '/b.webp', caption: 'Опалубка', takenAtLabel: 'июль 2026' },
        { url: '/c.webp', caption: 'Стены', takenAtLabel: 'август 2026' },
      ]);
    });

    test('фотографий нет — пустой массив', async () => {
      expect(await new GalleryService(prisma, new LocalStorage('uploads', 'http://localhost:3001/media')).getGallery()).toEqual([]);
    });
  });
});
