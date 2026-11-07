import { CAMPAIGN_SLUG } from '../database/seed/campaign.data';
import { createTestClient, describeDatabase, markPaid, resetDatabase, seedFixtures } from '../database/testing/test-database';
import type { PrismaClient } from '../generated/prisma/client';
import { startE2eApp } from './testing/e2e-app';
import type { E2eApp } from './testing/e2e-app';

/**
 * Идентификаторы визита для Яндекс Метрики сквозь настоящее приложение:
 * тело доната → колонки в базе, битые значения не срывают донат,
 * в публичную ленту ничего не утекает.
 */

interface Response<T> {
  readonly status: number;
  readonly body: T;
}

describeDatabase('Метрика: ymClientId и yclid в донате', () => {
  let e2e: E2eApp;
  let prisma: PrismaClient;

  jest.setTimeout(30_000);

  beforeAll(async () => {
    prisma = createTestClient();
    e2e = await startE2eApp(() => ({
      PAYMENT_PROVIDER: 'manual',
      PAYMENT_EMULATOR_ENABLED: 'false',
      WEB_REVALIDATE_URL: 'http://127.0.0.1:9/api/revalidate',
    }));
  });

  afterAll(async () => {
    await e2e.close();
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    await seedFixtures(prisma, { campaignSlug: CAMPAIGN_SLUG });
  });

  async function api<T>(path: string, init: RequestInit = {}): Promise<Response<T>> {
    const response = await fetch(`${e2e.apiUrl}${path}`, init);
    const text = await response.text();

    return { status: response.status, body: (text.length > 0 ? JSON.parse(text) : text) as T };
  }

  function postDonation(body: Record<string, unknown>): Promise<Response<{ orderId: string }>> {
    return api('/donations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amountKopecks: 10_000, channel: 'transfer', ...body }),
    });
  }

  describe('POST /donations: идентификаторы визита для Метрики', () => {
    test('ymClientId и yclid сохраняются в донате и не выходят в публичную ленту', async () => {
      // Act
      const response = await postDonation({
        attribution: { first: { source: 'vk' }, ymClientId: '1729000000123456789', yclid: '5207465128348827647' },
      });

      // Assert
      expect(response.status).toBe(201);
      expect(
        await prisma.donation.findUniqueOrThrow({
          where: { id: response.body.orderId },
          select: { ymClientId: true, yclid: true, utmSource: true },
        }),
      ).toEqual({ ymClientId: '1729000000123456789', yclid: '5207465128348827647', utmSource: 'vk' });

      await markPaid(prisma, response.body.orderId, 10_000n, new Date());

      const feed = await api<unknown>('/donations/feed');

      expect(feed.status).toBe(200);
      expect(JSON.stringify(feed.body)).not.toMatch(/1729000000123456789|5207465128348827647|ymClientId|yclid|utm/i);
    });

    test.each([
      ['ClientID с буквами', { ymClientId: '12ab' }],
      ['ClientID-объект вместо строки', { ymClientId: { id: 1 } }],
      ['слишком длинный yclid', { yclid: '9'.repeat(65) }],
      ['yclid с инъекцией', { yclid: '1,2' + String.fromCharCode(10) + '3' }],
    ])('%s — донат создаётся, идентификатор отброшен', async (_case, ids) => {
      // Act
      const response = await postDonation({ attribution: { first: { source: 'tg' }, ...ids } });

      // Assert: деньги важнее аналитики
      expect(response.status).toBe(201);
      expect(
        await prisma.donation.findUniqueOrThrow({
          where: { id: response.body.orderId },
          select: { ymClientId: true, yclid: true, utmSource: true },
        }),
      ).toEqual({ ymClientId: null, yclid: null, utmSource: 'tg' });
    });
  });
});
