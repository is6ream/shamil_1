import { ConfigService } from '@nestjs/config';

import { ROBOKASSA_PROVIDER_CODE } from '../config/constants';
import type { AppConfig } from '../config/configuration';
import { PrismaService } from '../database/prisma.service';
import {
  TEST_DONATION_KOPECKS,
  createPendingDonation,
  describeDatabase,
  markPaid,
  resetDatabase,
  seedFixtures,
} from '../database/testing/test-database';
import type { TestFixtures } from '../database/testing/test-database';
import { DonationStatus } from '../generated/prisma/enums';
import type { PaymentProvider } from './payment-provider.interface';
import type { ParsedWebhook, WebhookBody } from './payment-provider.types';
import { PaymentsService } from './payments.service';

/**
 * Применение колбэка на реальном PostgreSQL.
 *
 * Мокать здесь нечего: проверяются ровно те гарантии, которые живут в базе, —
 * уникальный ключ события, запрет обратного перехода и пересчёт витрин
 * триггером. На моках всё это зелёное и бессмысленное.
 */

/** Провайдеру в этих тестах достаточно кода: подпись проверена раньше. */
const PROVIDER_STUB: PaymentProvider = {
  code: ROBOKASSA_PROVIDER_CODE,
  createPayment: () => Promise.reject(new Error('в этих тестах не используется')),
  verifySignature: () => true,
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

interface WebhookOptions {
  readonly invoiceNo: number;
  readonly amountKopecks?: bigint;
  readonly providerEventId?: string;
}

function webhook({ invoiceNo, amountKopecks, providerEventId }: WebhookOptions): ParsedWebhook {
  return {
    providerEventId: providerEventId ?? String(invoiceNo),
    invoiceNo,
    status: DonationStatus.paid,
    amountKopecks: amountKopecks ?? TEST_DONATION_KOPECKS,
    method: 'sbp',
    acknowledgement: `OK${invoiceNo}`,
  };
}

/** Тело колбэка приходит как x-www-form-urlencoded: значения — строки. */
function body(invoiceNo: number): WebhookBody {
  return {
    OutSum: '100.00',
    InvId: String(invoiceNo),
    SignatureValue: 'подпись уже проверена',
    EMail: 'donor@example.com',
  };
}

describeDatabase('применение колбэка', () => {
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

  test('колбэк переводит донат в paid и двигает витрины', async () => {
    // Arrange
    const donation = await createPendingDonation(prisma, fixtures, {
      provider: ROBOKASSA_PROVIDER_CODE,
      regionId: fixtures.bashkortostanId,
    });

    // Act
    await payments.applyWebhook(webhook({ invoiceNo: donation.invoiceNo }), body(donation.invoiceNo));

    // Assert
    const stored = await prisma.donation.findUniqueOrThrow({ where: { id: donation.id } });
    const campaignStats = await prisma.campaignStats.findUniqueOrThrow({
      where: { campaignId: fixtures.campaignId },
    });

    expect(stored.status).toBe(DonationStatus.paid);
    expect(stored.paidAmountKopecks).toBe(TEST_DONATION_KOPECKS);
    expect(stored.paidAt).not.toBeNull();
    expect(stored.method).toBe('sbp');
    expect(campaignStats.paidTotalKopecks).toBe(TEST_DONATION_KOPECKS);
    expect(campaignStats.paidCount).toBe(1);
  });

  test('повторная доставка не задваивает сумму сбора и рейтинг региона', async () => {
    // Arrange: агрегаторы ретраят колбэк, пока не получат 200
    const donation = await createPendingDonation(prisma, fixtures, {
      provider: ROBOKASSA_PROVIDER_CODE,
      regionId: fixtures.bashkortostanId,
    });
    const event = webhook({ invoiceNo: donation.invoiceNo });

    await payments.applyWebhook(event, body(donation.invoiceNo));

    // Act: тот же колбэк ещё дважды — повтор обязан быть no-op, а не ошибкой
    await payments.applyWebhook(event, body(donation.invoiceNo));
    await payments.applyWebhook(event, body(donation.invoiceNo));

    // Assert
    const campaignStats = await prisma.campaignStats.findUniqueOrThrow({
      where: { campaignId: fixtures.campaignId },
    });
    const regionStats = await prisma.regionStats.findUniqueOrThrow({
      where: { regionId: fixtures.bashkortostanId },
    });
    const events = await prisma.paymentEvent.count({ where: { donationId: donation.id } });

    expect(campaignStats.paidTotalKopecks).toBe(TEST_DONATION_KOPECKS);
    expect(campaignStats.paidCount).toBe(1);
    expect(regionStats.paidTotalKopecks).toBe(TEST_DONATION_KOPECKS);
    expect(events).toBe(1);
  });

  test('зачисляется сумма из колбэка, а не из заказа', async () => {
    // Arrange: донатер оплатил больше, чем было в заказе
    const donation = await createPendingDonation(prisma, fixtures, {
      provider: ROBOKASSA_PROVIDER_CODE,
      amountKopecks: TEST_DONATION_KOPECKS,
    });
    const paid = TEST_DONATION_KOPECKS * 5n;

    // Act
    await payments.applyWebhook(
      webhook({ invoiceNo: donation.invoiceNo, amountKopecks: paid }),
      body(donation.invoiceNo),
    );

    // Assert: деньги реально пришли, отказаться от них нельзя
    const stored = await prisma.donation.findUniqueOrThrow({ where: { id: donation.id } });
    const campaignStats = await prisma.campaignStats.findUniqueOrThrow({
      where: { campaignId: fixtures.campaignId },
    });

    expect(stored.amountKopecks).toBe(TEST_DONATION_KOPECKS);
    expect(stored.paidAmountKopecks).toBe(paid);
    expect(campaignStats.paidTotalKopecks).toBe(paid);
  });

  test('новое событие по уже оплаченному донату ничего не меняет', async () => {
    // Arrange: у другого провайдера событий на один платёж может быть несколько
    const donation = await createPendingDonation(prisma, fixtures, {
      provider: ROBOKASSA_PROVIDER_CODE,
    });
    await markPaid(prisma, donation.id, TEST_DONATION_KOPECKS);

    // Act
    await payments.applyWebhook(
      webhook({ invoiceNo: donation.invoiceNo, providerEventId: 'другое-событие' }),
      body(donation.invoiceNo),
    );

    // Assert: событие сохранено, но ничего не применило
    const event = await prisma.paymentEvent.findFirstOrThrow({
      where: { providerEventId: 'другое-событие' },
    });
    const campaignStats = await prisma.campaignStats.findUniqueOrThrow({
      where: { campaignId: fixtures.campaignId },
    });

    expect(event.appliedAt).toBeNull();
    expect(campaignStats.paidTotalKopecks).toBe(TEST_DONATION_KOPECKS);
    expect(campaignStats.paidCount).toBe(1);
  });

  test('колбэк на неизвестный счёт сохраняется без доната', async () => {
    // Act: деньги где-то есть, и событие — единственное, с чем идти в поддержку
    await payments.applyWebhook(webhook({ invoiceNo: 999_999 }), body(999_999));

    // Assert
    const event = await prisma.paymentEvent.findFirstOrThrow({
      where: { providerEventId: '999999' },
    });
    const donations = await prisma.donation.count();

    expect(event.donationId).toBeNull();
    expect(event.appliedAt).toBeNull();
    expect(donations).toBe(0);
  });

  test('почта плательщика не сохраняется в теле события (152-ФЗ)', async () => {
    // Arrange
    const donation = await createPendingDonation(prisma, fixtures, {
      provider: ROBOKASSA_PROVIDER_CODE,
    });

    // Act
    await payments.applyWebhook(webhook({ invoiceNo: donation.invoiceNo }), body(donation.invoiceNo));

    // Assert: единственная копия ПДн вне donation_contact не должна появиться
    const event = await prisma.paymentEvent.findFirstOrThrow({
      where: { donationId: donation.id },
    });

    expect(JSON.stringify(event.payload)).not.toContain('donor@example.com');
    expect(JSON.stringify(event.payload)).toContain('InvId');
  });
});
