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
 * Жизненный цикл доната на уровне самой БД: pending → paid, paid финально.
 * Проверяется не сервис, а гарантия PostgreSQL — писать в donation будут
 * три разных пути (вебхук, админский ручной донат, сиды), и запрет обязан
 * работать для всех сразу.
 */
describeDatabase('жизненный цикл доната в БД', () => {
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

  test('pending → paid: обычный успешный платёж', async () => {
    // Arrange
    const donation = await createPendingDonation(prisma, fixtures);

    // Act
    await markPaid(prisma, donation.id, TEST_DONATION_KOPECKS);

    // Assert
    const stored = await prisma.donation.findUniqueOrThrow({ where: { id: donation.id } });
    expect(stored.status).toBe(DonationStatus.paid);
    expect(stored.paidAmountKopecks).toBe(TEST_DONATION_KOPECKS);
    expect(stored.paidAt).toEqual(TEST_PAID_AT);
  });

  test('paid → pending запрещён: оплаченный донат не возвращается в ожидание', async () => {
    // Arrange
    const donation = await createPendingDonation(prisma, fixtures);
    await markPaid(prisma, donation.id, TEST_DONATION_KOPECKS);

    // Act
    const act = prisma.donation.update({
      where: { id: donation.id },
      data: { status: DonationStatus.pending, paidAt: null, paidAmountKopecks: null },
    });

    // Assert
    await expect(act).rejects.toThrow(/DONATION_PAID_IS_FINAL/);
  });

  test('paid → failed запрещён: отказной колбэк после успешного ничего не отменяет', async () => {
    // Arrange
    const donation = await createPendingDonation(prisma, fixtures);
    await markPaid(prisma, donation.id, TEST_DONATION_KOPECKS);

    // Act
    const act = prisma.donation.update({
      where: { id: donation.id },
      data: { status: DonationStatus.failed, paidAt: null, paidAmountKopecks: null },
    });

    // Assert
    await expect(act).rejects.toThrow(/DONATION_PAID_IS_FINAL/);
  });

  test('pending → failed → paid разрешён: деньги важнее порядка доставки колбэков', async () => {
    // Arrange
    const donation = await createPendingDonation(prisma, fixtures);
    await prisma.donation.update({
      where: { id: donation.id },
      data: { status: DonationStatus.failed },
    });

    // Act
    await markPaid(prisma, donation.id, TEST_DONATION_KOPECKS);

    // Assert
    const stored = await prisma.donation.findUniqueOrThrow({ where: { id: donation.id } });
    expect(stored.status).toBe(DonationStatus.paid);
  });

  test('failed → pending запрещён: назад в ожидание пути нет', async () => {
    // Arrange
    const donation = await createPendingDonation(prisma, fixtures);
    await prisma.donation.update({
      where: { id: donation.id },
      data: { status: DonationStatus.failed },
    });

    // Act
    const act = prisma.donation.update({
      where: { id: donation.id },
      data: { status: DonationStatus.pending },
    });

    // Assert
    await expect(act).rejects.toThrow(/DONATION_NO_RETURN_TO_PENDING/);
  });

  test('повторный перевод в paid проходит как no-op: ретрай вебхука — не ошибка', async () => {
    // Arrange
    const donation = await createPendingDonation(prisma, fixtures);
    await markPaid(prisma, donation.id, TEST_DONATION_KOPECKS);

    // Act
    await markPaid(prisma, donation.id, TEST_DONATION_KOPECKS);

    // Assert
    const stored = await prisma.donation.findUniqueOrThrow({ where: { id: donation.id } });
    expect(stored.status).toBe(DonationStatus.paid);
    expect(stored.paidAmountKopecks).toBe(TEST_DONATION_KOPECKS);
  });

  test('оплаченный донат нельзя удалить: по нему посчитаны сумма сбора и рейтинг', async () => {
    // Arrange
    const donation = await createPendingDonation(prisma, fixtures);
    await markPaid(prisma, donation.id, TEST_DONATION_KOPECKS);

    // Act
    const act = prisma.donation.delete({ where: { id: donation.id } });

    // Assert
    await expect(act).rejects.toThrow(/DONATION_PAID_DELETE_FORBIDDEN/);
  });

  test('неоплаченный донат удалить можно: брошенные заказы чистятся', async () => {
    // Arrange
    const donation = await createPendingDonation(prisma, fixtures);

    // Act
    await prisma.donation.delete({ where: { id: donation.id } });

    // Assert
    const stored = await prisma.donation.findUnique({ where: { id: donation.id } });
    expect(stored).toBeNull();
  });

  test('paid без фактической суммы не записывается: витрины считать было бы нечем', async () => {
    // Arrange
    const donation = await createPendingDonation(prisma, fixtures);

    // Act
    const act = prisma.donation.update({
      where: { id: donation.id },
      data: { status: DonationStatus.paid, paidAt: TEST_PAID_AT },
    });

    // Assert
    await expect(act).rejects.toThrow(/donation_paid_fields/);
  });

  test('донат без региона проходит: платёж важнее статистики', async () => {
    // Act
    const donation = await createPendingDonation(prisma, fixtures);
    await markPaid(prisma, donation.id, TEST_DONATION_KOPECKS);

    // Assert
    const stored = await prisma.donation.findUniqueOrThrow({ where: { id: donation.id } });
    expect(stored.regionId).toBeNull();
    expect(stored.status).toBe(DonationStatus.paid);
  });

  test('регион без источника атрибуции не записывается', async () => {
    // Act
    const act = prisma.donation.create({
      data: {
        campaignId: fixtures.campaignId,
        regionId: fixtures.bashkortostanId,
        amountKopecks: TEST_DONATION_KOPECKS,
      },
    });

    // Assert
    await expect(act).rejects.toThrow(/donation_region_source_consistency/);
  });

  test('анонимный донат не хранит публичную подпись', async () => {
    // Act
    const act = prisma.donation.create({
      data: {
        campaignId: fixtures.campaignId,
        amountKopecks: TEST_DONATION_KOPECKS,
        isAnonymous: true,
        donorName: 'Наиль Хасанов',
      },
    });

    // Assert
    await expect(act).rejects.toThrow(/donation_anonymous_has_no_public_name/);
  });

  test('телефон принимается только в E.164', async () => {
    // Arrange
    const donation = await createPendingDonation(prisma, fixtures);

    // Act
    const act = prisma.donationContact.create({
      data: {
        donationId: donation.id,
        // Привычный российский формат без «+» и кода страны — не E.164.
        phoneE164: '89991234567',
        personalDataConsentAt: new Date(),
      },
    });

    // Assert
    await expect(act).rejects.toThrow(/donation_contact_phone_e164/);
  });

  test('ПДн удаляются отдельно от доната: сумма сбора при удалении не меняется', async () => {
    // Arrange
    const donation = await createPendingDonation(prisma, fixtures);
    await prisma.donationContact.create({
      data: {
        donationId: donation.id,
        phoneE164: '+79991234567',
        fullName: 'Наиль Хасанов',
        personalDataConsentAt: new Date(),
      },
    });
    await markPaid(prisma, donation.id, TEST_DONATION_KOPECKS);

    // Act
    await prisma.donationContact.delete({ where: { donationId: donation.id } });

    // Assert
    const stored = await prisma.donation.findUniqueOrThrow({ where: { id: donation.id } });
    expect(stored.status).toBe(DonationStatus.paid);
    expect(stored.paidAmountKopecks).toBe(TEST_DONATION_KOPECKS);
  });
});
