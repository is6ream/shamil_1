import type { PrismaClient } from '../generated/prisma/client';
import { DonationStatus } from '../generated/prisma/enums';
import {
  TEST_DONATION_KOPECKS,
  TEST_PAID_AT,
  createPendingDonation,
  createTestClient,
  describeDatabase,
  markPaid,
  resetDatabase,
  seedFixtures,
} from './testing/test-database';
import type { TestFixtures } from './testing/test-database';

/**
 * Витринные счётчики и живая лента.
 *
 * Главная страница читает три строки (сбор, цель месяца, топ регионов),
 * а не сканирует таблицу платежей: при 24 000 донатах референса SUM() по
 * каждому открытию главной — это лишний расход на ровном месте.
 * Лента листается keyset-курсором, без OFFSET.
 */
describeDatabase('витринные счётчики', () => {
  let prisma: PrismaClient;
  let fixtures: TestFixtures;

  beforeAll(() => {
    prisma = createTestClient();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    fixtures = await seedFixtures(prisma);
  });

  test('у нового сбора и нового региона строки счётчиков появляются сразу, с нулями', async () => {
    // Assert
    const campaignStats = await prisma.campaignStats.findUniqueOrThrow({
      where: { campaignId: fixtures.campaignId },
    });
    const regionStats = await prisma.regionStats.findUniqueOrThrow({
      where: { regionId: fixtures.bashkortostanId },
    });

    expect(campaignStats.paidTotalKopecks).toBe(0n);
    expect(regionStats.paidTotalKopecks).toBe(0n);
    expect(regionStats.lastPaidAt).toBeNull();
  });

  test('неоплаченный донат в витрины не попадает', async () => {
    // Act
    await createPendingDonation(prisma, fixtures, { regionId: fixtures.bashkortostanId });

    // Assert
    const campaignStats = await prisma.campaignStats.findUniqueOrThrow({
      where: { campaignId: fixtures.campaignId },
    });
    expect(campaignStats.paidTotalKopecks).toBe(0n);
    expect(campaignStats.paidCount).toBe(0);
  });

  test('оплата наполняет сбор, регион и цель месяца одновременно', async () => {
    // Arrange
    const donation = await createPendingDonation(prisma, fixtures, {
      regionId: fixtures.bashkortostanId,
    });

    // Act
    await markPaid(prisma, donation.id, 100_000n);

    // Assert
    const campaignStats = await prisma.campaignStats.findUniqueOrThrow({
      where: { campaignId: fixtures.campaignId },
    });
    const regionStats = await prisma.regionStats.findUniqueOrThrow({
      where: { regionId: fixtures.bashkortostanId },
    });
    const monthlyGoal = await prisma.campaignMonthlyGoal.findFirstOrThrow({
      where: { campaignId: fixtures.campaignId },
    });

    expect(campaignStats.paidTotalKopecks).toBe(100_000n);
    expect(campaignStats.paidCount).toBe(1);
    expect(campaignStats.lastPaidAt).toEqual(TEST_PAID_AT);
    expect(regionStats.paidTotalKopecks).toBe(100_000n);
    expect(monthlyGoal.collectedKopecks).toBe(100_000n);
  });

  test('донат из Казахстана считается наравне с субъектами РФ', async () => {
    // Arrange
    const donation = await createPendingDonation(prisma, fixtures, {
      regionId: fixtures.kazakhstanId,
    });

    // Act
    await markPaid(prisma, donation.id, 250_000n);

    // Assert
    const regionStats = await prisma.regionStats.findUniqueOrThrow({
      where: { regionId: fixtures.kazakhstanId },
    });
    expect(regionStats.paidTotalKopecks).toBe(250_000n);
  });

  test('донат без региона идёт в сумму сбора, но ни один регион не двигает', async () => {
    // Arrange
    const donation = await createPendingDonation(prisma, fixtures);

    // Act
    await markPaid(prisma, donation.id, TEST_DONATION_KOPECKS);

    // Assert
    const campaignStats = await prisma.campaignStats.findUniqueOrThrow({
      where: { campaignId: fixtures.campaignId },
    });
    const touchedRegions = await prisma.regionStats.count({
      where: { paidTotalKopecks: { gt: 0n } },
    });

    expect(campaignStats.paidTotalKopecks).toBe(TEST_DONATION_KOPECKS);
    expect(touchedRegions).toBe(0);
  });

  test('донат вне периода цели месяца в месячную шкалу не попадает', async () => {
    // Arrange
    const donation = await createPendingDonation(prisma, fixtures);

    // Act: 3 октября — за границей сентябрьского периода
    await markPaid(prisma, donation.id, 70_000n, new Date('2026-10-03T09:00:00.000Z'));

    // Assert
    const campaignStats = await prisma.campaignStats.findUniqueOrThrow({
      where: { campaignId: fixtures.campaignId },
    });
    const monthlyGoal = await prisma.campaignMonthlyGoal.findFirstOrThrow({
      where: { campaignId: fixtures.campaignId },
    });

    expect(campaignStats.paidTotalKopecks).toBe(70_000n);
    expect(monthlyGoal.collectedKopecks).toBe(0n);
  });

  test('исправленный регион оплаченного доната переносит сумму между рейтингами', async () => {
    // Arrange
    const donation = await createPendingDonation(prisma, fixtures, {
      regionId: fixtures.bashkortostanId,
    });
    await markPaid(prisma, donation.id, 300_000n);

    // Act: администратор поправил регион
    await prisma.donation.update({
      where: { id: donation.id },
      data: { regionId: fixtures.kazakhstanId, regionSource: 'admin' },
    });

    // Assert
    const bashkortostan = await prisma.regionStats.findUniqueOrThrow({
      where: { regionId: fixtures.bashkortostanId },
    });
    const kazakhstan = await prisma.regionStats.findUniqueOrThrow({
      where: { regionId: fixtures.kazakhstanId },
    });
    const campaignStats = await prisma.campaignStats.findUniqueOrThrow({
      where: { campaignId: fixtures.campaignId },
    });

    expect(bashkortostan.paidTotalKopecks).toBe(0n);
    expect(bashkortostan.paidCount).toBe(0);
    expect(kazakhstan.paidTotalKopecks).toBe(300_000n);
    expect(kazakhstan.paidCount).toBe(1);
    // Сумма сбора от переноса между регионами не меняется.
    expect(campaignStats.paidTotalKopecks).toBe(300_000n);
    expect(campaignStats.paidCount).toBe(1);
  });

  test('исправленная сумма оплаченного доната пересчитывает все витрины', async () => {
    // Arrange
    const donation = await createPendingDonation(prisma, fixtures, {
      regionId: fixtures.bashkortostanId,
    });
    await markPaid(prisma, donation.id, 300_000n);

    // Act
    await prisma.donation.update({
      where: { id: donation.id },
      data: { paidAmountKopecks: 250_000n },
    });

    // Assert
    const campaignStats = await prisma.campaignStats.findUniqueOrThrow({
      where: { campaignId: fixtures.campaignId },
    });
    const regionStats = await prisma.regionStats.findUniqueOrThrow({
      where: { regionId: fixtures.bashkortostanId },
    });
    const monthlyGoal = await prisma.campaignMonthlyGoal.findFirstOrThrow({
      where: { campaignId: fixtures.campaignId },
    });

    expect(campaignStats.paidTotalKopecks).toBe(250_000n);
    expect(campaignStats.paidCount).toBe(1);
    expect(regionStats.paidTotalKopecks).toBe(250_000n);
    expect(monthlyGoal.collectedKopecks).toBe(250_000n);
  });

  test('ручной донат, вставленный сразу оплаченным, тоже попадает в витрины', async () => {
    // Act: так админский эндпоинт подтверждает перевод по реквизитам
    await prisma.donation.create({
      data: {
        campaignId: fixtures.campaignId,
        regionId: fixtures.bashkortostanId,
        regionSource: 'admin',
        status: DonationStatus.paid,
        amountKopecks: 500_000n,
        paidAmountKopecks: 500_000n,
        paidAt: TEST_PAID_AT,
        method: 'bank_transfer',
      },
    });

    // Assert
    const campaignStats = await prisma.campaignStats.findUniqueOrThrow({
      where: { campaignId: fixtures.campaignId },
    });
    expect(campaignStats.paidTotalKopecks).toBe(500_000n);
    expect(campaignStats.paidCount).toBe(1);
  });

  test('несколько донатов складываются, а не перезаписывают друг друга', async () => {
    // Arrange / Act
    for (const amount of [10_000n, 50_000n, 100_000n]) {
      const donation = await createPendingDonation(prisma, fixtures, {
        regionId: fixtures.bashkortostanId,
        amountKopecks: amount,
      });
      await markPaid(prisma, donation.id, amount);
    }

    // Assert
    const regionStats = await prisma.regionStats.findUniqueOrThrow({
      where: { regionId: fixtures.bashkortostanId },
    });
    expect(regionStats.paidTotalKopecks).toBe(160_000n);
    expect(regionStats.paidCount).toBe(3);
  });

  test('живая лента листается keyset-курсором: страницы не пересекаются', async () => {
    // Arrange: три поступления с разным временем
    const moments = [
      new Date('2026-09-15T09:00:00.000Z'),
      new Date('2026-09-15T10:00:00.000Z'),
      new Date('2026-09-15T11:00:00.000Z'),
    ];

    for (const paidAt of moments) {
      const donation = await createPendingDonation(prisma, fixtures);
      await markPaid(prisma, donation.id, TEST_DONATION_KOPECKS, paidAt);
    }

    const page = async (cursor?: { paidAt: Date; id: string }) =>
      prisma.donation.findMany({
        where: {
          status: DonationStatus.paid,
          ...(cursor === undefined
            ? {}
            : {
                OR: [
                  { paidAt: { lt: cursor.paidAt } },
                  { paidAt: cursor.paidAt, id: { lt: cursor.id } },
                ],
              }),
        },
        orderBy: [{ paidAt: 'desc' }, { id: 'desc' }],
        take: 2,
        select: { id: true, paidAt: true },
      });

    // Act
    const first = await page();
    const last = first.at(-1);
    const second = await page(
      last === undefined || last.paidAt === null
        ? undefined
        : { paidAt: last.paidAt, id: last.id },
    );

    // Assert
    expect(first).toHaveLength(2);
    expect(first[0]?.paidAt).toEqual(moments[2]);
    expect(second).toHaveLength(1);
    expect(second[0]?.paidAt).toEqual(moments[0]);
  });
});
