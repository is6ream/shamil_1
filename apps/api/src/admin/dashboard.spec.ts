import { BadRequestException } from '@nestjs/common';

import type { PrismaService } from '../database/prisma.service';
import { CAMPAIGN_SLUG } from '../database/seed/campaign.data';
import {
  createPendingDonation,
  createTestPrismaService,
  describeDatabase,
  markPaid,
  resetDatabase,
  seedFixtures,
} from '../database/testing/test-database';
import type { TestFixtures } from '../database/testing/test-database';
import { DashboardService, resolvePeriod } from './dashboard.service';

describe('период дашборда', () => {
  test('по умолчанию — 30 дней до сейчас', () => {
    // Arrange
    const now = new Date('2026-10-09T00:00:00.000Z');

    // Act
    const period = resolvePeriod({}, now);

    // Assert
    expect(period.to).toEqual(now);
    expect(period.from).toEqual(new Date('2026-09-09T00:00:00.000Z'));
  });

  test('перевёрнутый и слишком длинный период — 400', () => {
    // Assert
    expect(() => resolvePeriod({ from: '2026-10-09T00:00:00Z', to: '2026-10-01T00:00:00Z' })).toThrow(BadRequestException);
    expect(() => resolvePeriod({ from: '2024-01-01T00:00:00Z', to: '2026-01-01T00:00:00Z' })).toThrow(BadRequestException);
  });
});

describeDatabase('дашборд', () => {
  let prisma: PrismaService;
  let fixtures: TestFixtures;

  jest.setTimeout(30_000);

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

  async function paid(amount: bigint, paidAt: string, utmSource?: string): Promise<void> {
    const donation = await createPendingDonation(prisma, fixtures, { amountKopecks: amount });

    if (utmSource !== undefined) {
      await prisma.donation.update({ where: { id: donation.id }, data: { utmSource } });
    }

    await markPaid(prisma, donation.id, amount, new Date(paidAt));
  }

  test('сумма, количество, средний чек, разбивки и последние — за период', async () => {
    // Arrange
    await paid(10_000n, '2026-09-10T10:00:00.000Z', 'vk');
    await paid(30_000n, '2026-09-10T12:00:00.000Z', 'vk');
    await paid(50_001n, '2026-09-11T12:00:00.000Z');
    await paid(99_999n, '2026-08-01T12:00:00.000Z', 'vk');
    await createPendingDonation(prisma, fixtures);

    // Act
    const dashboard = await new DashboardService(prisma).get(
      { from: '2026-09-01T00:00:00.000Z', to: '2026-10-01T00:00:00.000Z' },
      new Date('2026-09-20T00:00:00.000Z'),
    );

    // Assert
    expect(dashboard.period).toMatchObject({ totalKopecks: '90001', count: 3, averageKopecks: '30000' });
    expect(dashboard.campaign.collectedKopecks).toBe('190000');
    expect(dashboard.byDay).toEqual([
      { date: '2026-09-10', totalKopecks: '40000', count: 2 },
      { date: '2026-09-11', totalKopecks: '50001', count: 1 },
    ]);
    expect(dashboard.byUtm[0]).toEqual({ source: null, medium: null, campaign: null, totalKopecks: '50001', count: 1 });
    expect(dashboard.byUtm[1]).toMatchObject({ source: 'vk', totalKopecks: '40000', count: 2 });
    expect(dashboard.recent.map((row) => row.paidAmountKopecks)).toEqual(['50001', '30000', '10000', '99999']);
    expect(dashboard.monthlyGoal).toMatchObject({ periodStart: '2026-09-01', collectedKopecks: '90001' });
  });

  test('без поступлений средний чек — "0", не NaN', async () => {
    // Act
    const dashboard = await new DashboardService(prisma).get({});

    // Assert
    expect(dashboard.period).toMatchObject({ totalKopecks: '0', count: 0, averageKopecks: '0' });
  });
});
