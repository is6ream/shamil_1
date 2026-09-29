import { CAMPAIGN_SLUG } from '../database/seed/campaign.data';
import {
  createTestClient,
  describeDatabase,
  resetDatabase,
  seedFixtures,
} from '../database/testing/test-database';
import type { PrismaClient } from '../generated/prisma/client';
import { EMULATOR_PAYER_EMAIL } from '../payments/emulator/emulator.constants';
import {
  E2E_ADMIN_TOKEN,
  E2E_SITE_URL,
  emulatorEnv,
  findLink,
  startE2eApp,
  waitFor,
} from './testing/e2e-app';
import type { E2eApp } from './testing/e2e-app';

/**
 * Сквозная оплата в тестовом режиме: форма → эмулятор Robokassa → колбэк
 * по HTTP → статус → витрина. Приложение настоящее, колбэк настоящий,
 * база настоящая — проверяется всё, что увидит донатер, кроме браузера.
 */

const REGION_SLUG = '02';

interface CampaignBody {
  readonly collectedKopecks: string;
  readonly donationsCount: number;
}

interface StatusBody {
  readonly status: string;
  readonly paidAmountKopecks: string | null;
}

describeDatabase('сквозная тестовая оплата через эмулятор', () => {
  let e2e: E2eApp;
  let prisma: PrismaClient;

  jest.setTimeout(30_000);

  beforeAll(async () => {
    prisma = createTestClient();
    e2e = await startE2eApp(emulatorEnv);
  });

  afterAll(async () => {
    await e2e.close();
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    await seedFixtures(prisma, { campaignSlug: CAMPAIGN_SLUG });
  });

  async function api<T>(path: string, init?: RequestInit): Promise<{ status: number; body: T }> {
    const response = await fetch(`${e2e.apiUrl}${path}`, init);
    const text = await response.text();

    return { status: response.status, body: (text.length > 0 ? JSON.parse(text) : null) as T };
  }

  async function createDonation(channel: 'online' | 'transfer'): Promise<{ orderId: string; redirectUrl: string }> {
    const { status, body } = await api<{ orderId: string; redirectUrl: string }>('/donations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amountKopecks: 10_000, regionSlug: REGION_SLUG, regionSource: 'form', channel }),
    });

    expect(status).toBe(201);

    return body;
  }

  /** Открыть страницу оплаты и нажать кнопку сценария; вернуть Location редиректа. */
  async function payThroughEmulator(redirectUrl: string, label: string): Promise<URL> {
    const checkout = await fetch(redirectUrl);
    expect(checkout.status).toBe(200);

    const pay = await fetch(findLink(await checkout.text(), label), { redirect: 'manual' });
    expect(pay.status).toBe(302);

    return new URL(pay.headers.get('location') ?? '');
  }

  const status = async (orderId: string): Promise<StatusBody> =>
    (await api<StatusBody>(`/donations/${orderId}/status`)).body;
  const campaign = async (): Promise<CampaignBody> => (await api<CampaignBody>('/campaign')).body;

  test('online: форма → эмулятор «Оплатить» → paid → витрина выросла ровно на сумму', async () => {
    // Arrange
    const before = await campaign();
    const { orderId, redirectUrl } = await createDonation('online');

    // Act
    const back = await payThroughEmulator(redirectUrl, 'Оплатить: СБП');

    // Assert — возврат на «спасибо» в формате Robokassa
    expect(`${back.origin}${back.pathname}`).toBe(`${E2E_SITE_URL}/spasibo`);
    expect(back.searchParams.get('Shp_order_id')).toBe(orderId);
    expect(back.searchParams.get('Culture')).toBe('ru');

    expect((await status(orderId)).status).toBe('paid');

    const after = await campaign();
    expect(BigInt(after.collectedKopecks) - BigInt(before.collectedKopecks)).toBe(10_000n);
    expect(after.donationsCount).toBe(before.donationsCount + 1);

    const feed = await api<{ items: { id: string; method: string | null }[] }>('/donations/feed');
    expect(feed.body.items[0]).toMatchObject({ id: orderId, method: 'sbp' });

    const top = await api<{ items: { slug: string }[] }>('/regions/top');
    expect(top.body.items.map((row) => row.slug)).toContain(REGION_SLUG);

    // Почта плательщика из колбэка не оседает в журнале событий (152-ФЗ)
    const event = await prisma.paymentEvent.findFirstOrThrow({ where: { donationId: orderId } });
    expect(JSON.stringify(event.payload)).not.toContain(EMULATOR_PAYER_EMAIL);
  });

  test('колбэк дважды: сумма выросла один раз, применённое событие одно', async () => {
    // Arrange
    const { orderId, redirectUrl } = await createDonation('online');

    // Act
    await payThroughEmulator(redirectUrl, 'Колбэк дважды');

    // Assert
    expect((await campaign()).collectedKopecks).toBe('10000');
    expect(await prisma.paymentEvent.count({ where: { donationId: orderId, appliedAt: { not: null } } })).toBe(1);
  });

  test('битая подпись: 401, донат pending, ни одной новой строки в payment_event', async () => {
    // Arrange
    const { orderId, redirectUrl } = await createDonation('online');

    // Act
    await payThroughEmulator(redirectUrl, 'Колбэк с битой подписью');

    // Assert
    expect((await status(orderId)).status).toBe('pending');
    expect(await prisma.paymentEvent.count()).toBe(0);
  });

  test('на 1 ₽ меньше: зачислено по факту оплаты', async () => {
    // Arrange
    const { orderId, redirectUrl } = await createDonation('online');

    // Act
    await payThroughEmulator(redirectUrl, 'Оплатить на 1 ₽ меньше');

    // Assert
    expect(await status(orderId)).toMatchObject({ status: 'paid', paidAmountKopecks: '9900' });
  });

  test('отказ: Fail URL — главная, колбэка нет, донат pending', async () => {
    // Arrange
    const { orderId, redirectUrl } = await createDonation('online');

    // Act
    const back = await payThroughEmulator(redirectUrl, 'Отказаться от оплаты');

    // Assert
    expect(back.toString()).toBe(`${E2E_SITE_URL}/`);
    expect((await status(orderId)).status).toBe('pending');
  });

  test('колбэк позже редиректа: сразу pending, затем paid без участия браузера', async () => {
    // Arrange
    const { orderId, redirectUrl } = await createDonation('online');

    // Act
    await payThroughEmulator(redirectUrl, 'Колбэк через 10 с');

    // Assert — редирект обогнал колбэк, как у настоящей Robokassa
    expect((await status(orderId)).status).toBe('pending');

    const late = await waitFor(() => status(orderId), (body) => body.status === 'paid', 15_000);
    expect(late.status).toBe('paid');
  }, 25_000);

  test('подделанная ссылка сценария — 400, колбэка нет', async () => {
    // Arrange
    const { orderId, redirectUrl } = await createDonation('online');
    const html = await (await fetch(redirectUrl)).text();
    const link = new URL(findLink(html, 'Оплатить: СБП'));
    link.searchParams.set('s', '0'.repeat(64));

    // Act
    const response = await fetch(link, { redirect: 'manual' });

    // Assert
    expect(response.status).toBe(400);
    expect((await status(orderId)).status).toBe('pending');
  });

  test('ссылка на оплату с подменённой суммой — эмулятор отвечает 400', async () => {
    // Arrange
    const { redirectUrl } = await createDonation('online');
    const forged = new URL(redirectUrl);
    forged.searchParams.set('OutSum', '1.00');

    // Act
    const response = await fetch(forged);

    // Assert
    expect(response.status).toBe(400);
    expect(await response.text()).toContain('Подпись ссылки не сошлась');
  });

  test('transfer: страница реквизитов, подтверждение из админки → paid', async () => {
    // Arrange
    const { orderId, redirectUrl } = await createDonation('transfer');

    // Act
    const confirm = await api<{ status: string; applied: boolean }>(`/admin/donations/${orderId}/confirm`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${E2E_ADMIN_TOKEN}`, 'Content-Type': 'application/json' },
      body: '{}',
    });

    // Assert
    expect(redirectUrl).toBe(`${E2E_SITE_URL}/donate/transfer?order_id=${orderId}`);
    expect(confirm.status).toBe(200);
    expect(confirm.body).toMatchObject({ status: 'paid', applied: true });
    expect((await status(orderId)).status).toBe('paid');
    expect((await campaign()).collectedKopecks).toBe('10000');
  });

  test('витрина без троттлинга: 80 запросов подряд — ни одного 429', async () => {
    // Act
    const statuses = await Promise.all(
      Array.from({ length: 80 }, async () => (await fetch(`${e2e.apiUrl}/campaign`)).status),
    );

    // Assert
    expect(statuses.filter((code) => code === 429)).toEqual([]);
  });

  test('лишний query-параметр ленты и битый курсор — 400', async () => {
    expect((await api('/donations/feed?offset=10')).status).toBe(400);
    expect((await api('/donations/feed?limit=51')).status).toBe(400);
    expect((await api('/donations/feed?cursor=bad')).status).toBe(400);
  });
});
