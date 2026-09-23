import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import {
  MANUAL_CONFIRM_DEFAULT_METHOD,
  MANUAL_PROVIDER_CODE,
  ROBOKASSA_PROVIDER_CODE,
} from '../config/constants';
import type { AppConfig } from '../config/configuration';
import { PrismaService } from '../database/prisma.service';
import {
  TEST_DONATION_KOPECKS,
  createPendingDonation,
  describeDatabase,
  resetDatabase,
  seedFixtures,
} from '../database/testing/test-database';
import type { TestFixtures } from '../database/testing/test-database';
import { DonationStatus } from '../generated/prisma/enums';
import type { PaymentProvider } from '../payments/payment-provider.interface';
import { PaymentsService } from '../payments/payments.service';

/**
 * Админское подтверждение ручного перевода на реальном PostgreSQL.
 *
 * Мокать здесь нечего ровно по той же причине, что и в `webhook-apply.spec.ts`:
 * проверяются гарантии, которые живут в базе, — уникальный ключ события,
 * запрет обратного перехода и пересчёт витрин триггером. На моках всё это
 * зелёное и бессмысленное.
 */

/** Активный провайдер приложения в подтверждении не участвует — код взят из доната. */
const PROVIDER_STUB: PaymentProvider = {
  code: MANUAL_PROVIDER_CODE,
  createPayment: () => Promise.reject(new Error('в этих тестах не используется')),
  verifySignature: () => false,
  parseWebhook: () => {
    throw new Error('в этих тестах не используется');
  },
};

function createPrisma(): PrismaService {
  const url = process.env.TEST_DATABASE_URL;

  if (url === undefined || url.length === 0) {
    throw new Error('TEST_DATABASE_URL не задан');
  }

  return new PrismaService(new ConfigService<AppConfig, true>({ database: { url } }));
}

describeDatabase('подтверждение ручного перевода', () => {
  let prisma: PrismaService;
  let payments: PaymentsService;
  let fixtures: TestFixtures;

  beforeAll(() => {
    prisma = createPrisma();
    payments = new PaymentsService(prisma, PROVIDER_STUB);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    fixtures = await seedFixtures(prisma);
  });

  test('подтверждение переводит донат в paid и двигает витрины', async () => {
    // Arrange
    const donation = await createPendingDonation(prisma, fixtures, {
      regionId: fixtures.bashkortostanId,
    });

    // Act
    const result = await payments.confirmManual(donation.id);

    // Assert
    const stored = await prisma.donation.findUniqueOrThrow({ where: { id: donation.id } });
    const campaignStats = await prisma.campaignStats.findUniqueOrThrow({
      where: { campaignId: fixtures.campaignId },
    });
    const regionStats = await prisma.regionStats.findUniqueOrThrow({
      where: { regionId: fixtures.bashkortostanId },
    });

    expect(result.applied).toBe(true);
    expect(result.status).toBe(DonationStatus.paid);
    expect(stored.status).toBe(DonationStatus.paid);
    expect(stored.paidAmountKopecks).toBe(TEST_DONATION_KOPECKS);
    expect(stored.paidAt).not.toBeNull();
    expect(stored.method).toBe(MANUAL_CONFIRM_DEFAULT_METHOD);
    expect(campaignStats.paidTotalKopecks).toBe(TEST_DONATION_KOPECKS);
    expect(campaignStats.paidCount).toBe(1);
    expect(regionStats.paidTotalKopecks).toBe(TEST_DONATION_KOPECKS);
  });

  test('подтверждение проходит через ту же машинерию, что и вебхук', async () => {
    // Arrange: событие в payment_event — не деталь реализации, а единственный
    // след ручного зачисления и ключ его идемпотентности
    const donation = await createPendingDonation(prisma, fixtures);

    // Act
    await payments.confirmManual(donation.id);

    // Assert
    const event = await prisma.paymentEvent.findFirstOrThrow({
      where: { donationId: donation.id },
    });

    expect(event.provider).toBe(MANUAL_PROVIDER_CODE);
    expect(event.providerEventId).toBe(`manual:${donation.invoiceNo}`);
    expect(event.status).toBe(DonationStatus.paid);
    expect(event.amountKopecks).toBe(TEST_DONATION_KOPECKS);
    expect(event.appliedAt).not.toBeNull();
  });

  test('повторное подтверждение не задваивает сумму сбора и рейтинг региона', async () => {
    // Arrange: админ нажал дважды или вернулся к уже подтверждённому донату
    const donation = await createPendingDonation(prisma, fixtures, {
      regionId: fixtures.bashkortostanId,
    });
    await payments.confirmManual(donation.id);

    // Act
    const second = await payments.confirmManual(donation.id);
    const third = await payments.confirmManual(donation.id);

    // Assert
    const campaignStats = await prisma.campaignStats.findUniqueOrThrow({
      where: { campaignId: fixtures.campaignId },
    });
    const regionStats = await prisma.regionStats.findUniqueOrThrow({
      where: { regionId: fixtures.bashkortostanId },
    });
    const events = await prisma.paymentEvent.count({ where: { donationId: donation.id } });

    // Повтор — не ошибка: донат оплачен, просто зачислять второй раз нечего.
    expect(second.applied).toBe(false);
    expect(second.status).toBe(DonationStatus.paid);
    expect(third.applied).toBe(false);
    expect(campaignStats.paidTotalKopecks).toBe(TEST_DONATION_KOPECKS);
    expect(campaignStats.paidCount).toBe(1);
    expect(regionStats.paidTotalKopecks).toBe(TEST_DONATION_KOPECKS);
    expect(regionStats.paidCount).toBe(1);
    expect(events).toBe(1);
  });

  test('повтор с другой суммой ничего не переписывает', async () => {
    // Arrange: идемпотентность сильнее аргументов — иначе повторное нажатие
    // с исправленной цифрой молча разошлось бы с выпиской
    const donation = await createPendingDonation(prisma, fixtures);
    await payments.confirmManual(donation.id);

    // Act
    const second = await payments.confirmManual(donation.id, {
      amountKopecks: TEST_DONATION_KOPECKS * 100n,
    });

    // Assert
    const stored = await prisma.donation.findUniqueOrThrow({ where: { id: donation.id } });

    expect(second.applied).toBe(false);
    expect(stored.paidAmountKopecks).toBe(TEST_DONATION_KOPECKS);
  });

  test('донат агрегатора вручную подтвердить нельзя', async () => {
    // Arrange: robokassa-донат подтверждает только её колбэк — иначе появился бы
    // второй источник правды о деньгах, с правом объявить платёж состоявшимся
    const donation = await createPendingDonation(prisma, fixtures, {
      provider: ROBOKASSA_PROVIDER_CODE,
      regionId: fixtures.bashkortostanId,
    });

    // Act
    const act = async (): Promise<unknown> => payments.confirmManual(donation.id);

    // Assert
    await expect(act()).rejects.toThrow(BadRequestException);

    const stored = await prisma.donation.findUniqueOrThrow({ where: { id: donation.id } });
    const events = await prisma.paymentEvent.count();
    const campaignStats = await prisma.campaignStats.findUniqueOrThrow({
      where: { campaignId: fixtures.campaignId },
    });

    expect(stored.status).toBe(DonationStatus.pending);
    expect(stored.paidAmountKopecks).toBeNull();
    expect(events).toBe(0);
    expect(campaignStats.paidTotalKopecks).toBe(0n);
  });

  test('зачисляется фактическая сумма, если она разошлась с заказом', async () => {
    // Arrange: по реквизитам пришло больше, чем было в заказе
    const donation = await createPendingDonation(prisma, fixtures);
    const actual = TEST_DONATION_KOPECKS * 3n;

    // Act
    const result = await payments.confirmManual(donation.id, {
      amountKopecks: actual,
      method: 'sbp',
    });

    // Assert
    const stored = await prisma.donation.findUniqueOrThrow({ where: { id: donation.id } });
    const campaignStats = await prisma.campaignStats.findUniqueOrThrow({
      where: { campaignId: fixtures.campaignId },
    });

    expect(result.paidAmountKopecks).toBe(actual);
    expect(stored.amountKopecks).toBe(TEST_DONATION_KOPECKS);
    expect(stored.paidAmountKopecks).toBe(actual);
    expect(stored.method).toBe('sbp');
    expect(campaignStats.paidTotalKopecks).toBe(actual);
  });

  test('несуществующий донат — 404, а не молчаливый успех', async () => {
    // Act
    const act = async (): Promise<unknown> =>
      payments.confirmManual('00000000-0000-4000-8000-000000000000');

    // Assert
    await expect(act()).rejects.toThrow(NotFoundException);
  });

  test('ПДн донатера не попадают в тело события (152-ФЗ)', async () => {
    // Arrange: имя для сверки поступления по реквизитам живёт в donation_contact
    const donation = await createPendingDonation(prisma, fixtures);
    await prisma.donationContact.create({
      data: {
        donationId: donation.id,
        phoneE164: '+79991234567',
        fullName: 'Усман Усманов',
        personalDataConsentAt: new Date(),
      },
    });

    // Act
    await payments.confirmManual(donation.id);

    // Assert
    const event = await prisma.paymentEvent.findFirstOrThrow({
      where: { donationId: donation.id },
    });
    const payload = JSON.stringify(event.payload);

    expect(payload).not.toContain('79991234567');
    expect(payload).not.toContain('Усман');
    expect(payload).toContain('admin');
  });
});
