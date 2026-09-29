import { CAMPAIGN_SLUG } from '../database/seed/campaign.data';
import {
  createTestClient,
  describeDatabase,
  resetDatabase,
  seedFixtures,
} from '../database/testing/test-database';
import type { PrismaClient } from '../generated/prisma/client';
import { ONLINE_UNAVAILABLE_MESSAGE } from '../payments/payment-provider.resolver';
import { startE2eApp } from './testing/e2e-app';
import type { E2eApp } from './testing/e2e-app';

/**
 * Приложение как на проде до активации мерчанта: `PAYMENT_PROVIDER=manual`,
 * эмулятор выключен. Маршрутов эмулятора нет, онлайн-оплаты нет, колбэк
 * Robokassa проверить некому.
 */
describeDatabase('эмулятор выключен, онлайн-провайдера нет', () => {
  let e2e: E2eApp;
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = createTestClient();
    e2e = await startE2eApp(() => ({ PAYMENT_PROVIDER: 'manual', PAYMENT_EMULATOR_ENABLED: 'false' }));
  });

  afterAll(async () => {
    await e2e.close();
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    await seedFixtures(prisma, { campaignSlug: CAMPAIGN_SLUG });
  });

  test('маршрутов эмулятора нет — 404', async () => {
    expect((await fetch(`${e2e.apiUrl}/dev/robokassa/checkout`)).status).toBe(404);
    expect((await fetch(`${e2e.apiUrl}/dev/robokassa/pay?p=x&s=y`)).status).toBe(404);
  });

  test('channel=online — 400 с человеческим текстом, заказ не создан', async () => {
    // Act
    const response = await fetch(`${e2e.apiUrl}/donations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amountKopecks: 10_000, channel: 'online' }),
    });

    // Assert
    expect(response.status).toBe(400);
    expect(((await response.json()) as { message: string }).message).toBe(ONLINE_UNAVAILABLE_MESSAGE);
    expect(await prisma.donation.count()).toBe(0);
  });

  test('колбэк Robokassa — 401 и ни одной записи', async () => {
    // Act
    const response = await fetch(`${e2e.apiUrl}/payments/robokassa/result`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'OutSum=100.00&InvId=1&SignatureValue=abc',
    });

    // Assert
    expect(response.status).toBe(401);
    expect(await prisma.paymentEvent.count()).toBe(0);
  });
});
