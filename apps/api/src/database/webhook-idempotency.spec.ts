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
 * Идемпотентность вебхука.
 *
 * Агрегаторы (у референса — Robokassa) ретраят колбэк, пока не получат 200,
 * и присылают его повторно даже после успеха. Без уникального ключа события
 * один донат задваивается и в сумме сбора, и в рейтинге региона — то есть
 * на главной странице появляются деньги, которых нет.
 */
const PROVIDER = 'robokassa';

describeDatabase('идемпотентность вебхука', () => {
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

  test('одно и то же событие провайдера не записывается дважды', async () => {
    // Arrange
    const donation = await createPendingDonation(prisma, fixtures, { provider: PROVIDER });
    const event = {
      donationId: donation.id,
      provider: PROVIDER,
      providerEventId: 'inv-100500',
      status: DonationStatus.paid,
      amountKopecks: TEST_DONATION_KOPECKS,
      payload: { InvId: '100500', OutSum: '100.00' },
    };
    await prisma.paymentEvent.create({ data: event });

    // Act
    const act = prisma.paymentEvent.create({ data: event });

    // Assert
    await expect(act).rejects.toMatchObject({ code: 'P2002' });
  });

  test('разные провайдеры могут прислать событие с одинаковым id', async () => {
    // Arrange
    const donation = await createPendingDonation(prisma, fixtures, { provider: PROVIDER });

    // Act
    await prisma.paymentEvent.create({
      data: {
        donationId: donation.id,
        provider: PROVIDER,
        providerEventId: '1',
        status: DonationStatus.paid,
        payload: {},
      },
    });
    await prisma.paymentEvent.create({
      data: {
        donationId: donation.id,
        provider: 'kaspi',
        providerEventId: '1',
        status: DonationStatus.paid,
        payload: {},
      },
    });

    // Assert
    const stored = await prisma.paymentEvent.count({ where: { providerEventId: '1' } });
    expect(stored).toBe(2);
  });

  test('повторная доставка колбэка не задваивает сумму сбора', async () => {
    // Arrange: первая доставка — событие и перевод в paid одной транзакцией
    const donation = await createPendingDonation(prisma, fixtures, {
      provider: PROVIDER,
      regionId: fixtures.bashkortostanId,
    });

    const deliver = async (): Promise<void> => {
      await prisma.$transaction(async (tx) => {
        await tx.paymentEvent.create({
          data: {
            donationId: donation.id,
            provider: PROVIDER,
            providerEventId: 'inv-777',
            status: DonationStatus.paid,
            amountKopecks: TEST_DONATION_KOPECKS,
            payload: { InvId: '777' },
            appliedAt: new Date(),
          },
        });

        await tx.donation.update({
          where: { id: donation.id },
          data: {
            status: DonationStatus.paid,
            paidAmountKopecks: TEST_DONATION_KOPECKS,
            paidAt: TEST_PAID_AT,
          },
        });
      });
    };

    await deliver();

    // Act: провайдер присылает тот же колбэк снова
    await expect(deliver()).rejects.toMatchObject({ code: 'P2002' });

    // Assert: донат оплачен один раз, витрины посчитали его один раз
    const campaignStats = await prisma.campaignStats.findUniqueOrThrow({
      where: { campaignId: fixtures.campaignId },
    });
    const regionStats = await prisma.regionStats.findUniqueOrThrow({
      where: { regionId: fixtures.bashkortostanId },
    });

    expect(campaignStats.paidTotalKopecks).toBe(TEST_DONATION_KOPECKS);
    expect(campaignStats.paidCount).toBe(1);
    expect(regionStats.paidTotalKopecks).toBe(TEST_DONATION_KOPECKS);
    expect(regionStats.paidCount).toBe(1);
  });

  test('повторный перевод в paid не задваивает витрины, даже если событие новое', async () => {
    // Arrange: у провайдера может быть два разных события об одном платеже
    const donation = await createPendingDonation(prisma, fixtures, {
      provider: PROVIDER,
      regionId: fixtures.bashkortostanId,
    });
    await markPaid(prisma, donation.id, TEST_DONATION_KOPECKS);

    // Act
    await markPaid(prisma, donation.id, TEST_DONATION_KOPECKS);

    // Assert
    const campaignStats = await prisma.campaignStats.findUniqueOrThrow({
      where: { campaignId: fixtures.campaignId },
    });
    const monthlyGoal = await prisma.campaignMonthlyGoal.findFirstOrThrow({
      where: { campaignId: fixtures.campaignId },
    });

    expect(campaignStats.paidTotalKopecks).toBe(TEST_DONATION_KOPECKS);
    expect(campaignStats.paidCount).toBe(1);
    expect(monthlyGoal.collectedKopecks).toBe(TEST_DONATION_KOPECKS);
  });

  test('колбэк на неизвестный заказ сохраняется без доната — разбирать с провайдером', async () => {
    // Act
    const event = await prisma.paymentEvent.create({
      data: {
        provider: PROVIDER,
        providerEventId: 'inv-unknown',
        status: DonationStatus.paid,
        amountKopecks: TEST_DONATION_KOPECKS,
        payload: { InvId: 'нет такого заказа' },
      },
      select: { id: true, donationId: true, appliedAt: true },
    });

    // Assert
    expect(event.donationId).toBeNull();
    expect(event.appliedAt).toBeNull();
  });
});
