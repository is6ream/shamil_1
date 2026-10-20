import type { PrismaService } from '../database/prisma.service';
import {
  createTestPrismaService,
  describeDatabase,
  resetDatabase,
  seedFixtures,
} from '../database/testing/test-database';
import type { TestFixtures } from '../database/testing/test-database';
import { DonationStatus } from '../generated/prisma/enums';
import { AnalyticsService } from './analytics.service';

const NOW = new Date('2026-10-19T12:00:00.000Z');
const IN_PERIOD = new Date('2026-10-10T12:00:00.000Z');
const BEFORE_PERIOD = new Date('2026-08-01T12:00:00.000Z');
const PERIOD = { from: '2026-10-01T00:00:00.000Z', to: '2026-10-19T12:00:00.000Z' } as const;

interface DonationSeed {
  readonly kopecks: bigint;
  readonly status?: DonationStatus;
  readonly paidAt?: Date;
  readonly first?: { source: string; campaign?: string; content?: string };
  readonly last?: { source: string; campaign?: string };
  readonly howDidYouHear?: string;
}

describeDatabase('AnalyticsService.donationsBySource', () => {
  let prisma: PrismaService;
  let service: AnalyticsService;
  let fixtures: TestFixtures;

  beforeAll(() => {
    prisma = createTestPrismaService();
    service = new AnalyticsService(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    fixtures = await seedFixtures(prisma);
  });

  async function seed(donations: readonly DonationSeed[]): Promise<void> {
    for (const donation of donations) {
      const status = donation.status ?? DonationStatus.paid;
      const isPaid = status === DonationStatus.paid;

      await prisma.donation.create({
        data: {
          campaignId: fixtures.campaignId,
          amountKopecks: donation.kopecks,
          status,
          paidAmountKopecks: isPaid ? donation.kopecks : null,
          paidAt: isPaid ? (donation.paidAt ?? IN_PERIOD) : null,
          utmSource: donation.first?.source ?? null,
          utmCampaign: donation.first?.campaign ?? null,
          utmContent: donation.first?.content ?? null,
          lastUtmSource: donation.last?.source ?? donation.first?.source ?? null,
          lastUtmCampaign: donation.last?.campaign ?? donation.first?.campaign ?? null,
          howDidYouHear: donation.howDidYouHear ?? null,
        },
      });
    }
  }

  test('только оплаченные за период: pending и старые оплаты в отчёт не попадают', async () => {
    // Arrange
    await seed([
      { kopecks: 10_000n, first: { source: 'telegram' } },
      { kopecks: 30_000n, first: { source: 'telegram' } },
      { kopecks: 50_000n, first: { source: 'telegram' }, status: DonationStatus.pending },
      { kopecks: 70_000n, first: { source: 'telegram' }, paidAt: BEFORE_PERIOD },
    ]);

    // Act
    const report = await service.donationsBySource({ ...PERIOD, model: 'first' }, NOW);

    // Assert
    expect(report.rows).toEqual([{ source: 'telegram', count: 2, totalKopecks: '40000', averageKopecks: '20000' }]);
    expect(report.total).toEqual({ count: 2, totalKopecks: '40000', averageKopecks: '20000' });
  });

  test('модели first и last дают разную картину по одним и тем же донатам', async () => {
    // Arrange
    await seed([
      { kopecks: 10_000n, first: { source: 'telegram' }, last: { source: 'instagram' } },
      { kopecks: 20_000n, first: { source: 'telegram' } },
    ]);

    // Act
    const first = await service.donationsBySource({ ...PERIOD, model: 'first' }, NOW);
    const last = await service.donationsBySource({ ...PERIOD, model: 'last' }, NOW);

    // Assert
    expect(first.rows.map((row) => [row.source, row.count])).toEqual([['telegram', 2]]);
    expect(last.rows.map((row) => [row.source, row.totalKopecks])).toEqual([
      ['telegram', '20000'],
      ['instagram', '10000'],
    ]);
  });

  test('донаты без атрибуции — отдельной строкой, а не потеряны', async () => {
    // Arrange
    await seed([{ kopecks: 10_000n, first: { source: 'vk' } }, { kopecks: 25_000n }, { kopecks: 35_000n }]);

    // Act
    const report = await service.donationsBySource(PERIOD, NOW);

    // Assert
    expect(report.unattributed).toEqual({ count: 2, totalKopecks: '60000', averageKopecks: '30000' });
    expect(report.total.count).toBe(3);
    expect(report.rows).toHaveLength(1);
  });

  test('разрез по кампании группирует вместе с источником', async () => {
    // Arrange
    await seed([
      { kopecks: 10_000n, first: { source: 'telegram', campaign: 'ramadan' } },
      { kopecks: 10_000n, first: { source: 'instagram', campaign: 'ramadan' } },
      { kopecks: 10_000n, first: { source: 'instagram' } },
    ]);

    // Act
    const report = await service.donationsBySource({ ...PERIOD, model: 'first', groupBy: 'campaign' }, NOW);

    // Assert
    expect(report.rows).toHaveLength(3);
    expect(report.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ source: 'telegram', campaign: 'ramadan', count: 1 }),
        expect.objectContaining({ source: 'instagram', campaign: 'ramadan', count: 1 }),
        expect.objectContaining({ source: 'instagram', campaign: null, count: 1 }),
      ]),
    );
  });

  test('разрез по content возвращает источник, кампанию и объявление', async () => {
    // Arrange
    await seed([{ kopecks: 10_000n, first: { source: 'vk', campaign: 'oct', content: 'banner-1' } }]);

    // Act
    const report = await service.donationsBySource({ ...PERIOD, model: 'first', groupBy: 'content' }, NOW);

    // Assert
    expect(report.rows[0]).toMatchObject({ source: 'vk', campaign: 'oct', content: 'banner-1' });
  });

  test('разрез «откуда узнали» для переводов', async () => {
    // Arrange
    await seed([
      { kopecks: 10_000n, howDidYouHear: 'mosque' },
      { kopecks: 20_000n, howDidYouHear: 'mosque' },
      { kopecks: 5_000n, first: { source: 'telegram' } },
    ]);

    // Act
    const report = await service.donationsBySource({ ...PERIOD, groupBy: 'how_did_you_hear' }, NOW);

    // Assert
    expect(report.rows).toEqual([{ source: 'mosque', count: 2, totalKopecks: '30000', averageKopecks: '15000' }]);
    expect(report.unattributed.count).toBe(1);
  });

  test('по умолчанию — модель last и разрез по источнику', async () => {
    // Act
    const report = await service.donationsBySource({}, NOW);

    // Assert
    expect(report).toMatchObject({ model: 'last', groupBy: 'source', rows: [] });
    expect(report.total).toEqual({ count: 0, totalKopecks: '0', averageKopecks: '0' });
  });
});
