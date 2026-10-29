import { CAMPAIGN_SLUG } from '../database/seed/campaign.data';
import {
  TEST_ADMIN_PASSWORD,
  createTestAdmin,
  createTestClient,
  describeDatabase,
  markPaid,
  resetDatabase,
  seedFixtures,
} from '../database/testing/test-database';
import type { PrismaClient } from '../generated/prisma/client';
import { AdminRole } from '../generated/prisma/enums';
import { E2E_SITE_URL, startE2eApp } from './testing/e2e-app';
import type { E2eApp } from './testing/e2e-app';

/**
 * Атрибуция сквозь настоящее приложение: тело доната → колонки в базе,
 * короткая ссылка → 302 и клик, админка → ссылки и отчёт по источникам.
 */

const BROWSER_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) AppleWebKit/605.1.15 Mobile/15E148';

interface Response<T> {
  readonly status: number;
  readonly body: T;
  readonly headers: Headers;
}

interface ShortLinkBody {
  readonly id: string;
  readonly shortUrl: string;
  readonly targetUrl: string;
  readonly clicks: number;
}

interface ReportBody {
  readonly rows: readonly { readonly source: string; readonly count: number; readonly totalKopecks: string }[];
  readonly unattributed: { readonly count: number };
}

describeDatabase('атрибуция и короткие ссылки: сквозные сценарии', () => {
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
    const response = await fetch(`${e2e.apiUrl}${path}`, { redirect: 'manual', ...init });
    const text = await response.text();
    const body = (text.length > 0 && response.headers.get('content-type')?.includes('json') === true
      ? JSON.parse(text)
      : text) as T;

    return { status: response.status, body, headers: response.headers };
  }

  async function login(role: AdminRole): Promise<Record<string, string>> {
    const email = `${role.toLowerCase()}@example.test`;

    await createTestAdmin(prisma, { email, role });

    const response = await api<{ accessToken: string }>('/admin/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': `10.9.0.${role.length}` },
      body: JSON.stringify({ email, password: TEST_ADMIN_PASSWORD }),
    });

    expect(response.status).toBe(200);

    return { Authorization: `Bearer ${response.body.accessToken}`, 'Content-Type': 'application/json' };
  }

  function postDonation(body: Record<string, unknown>): Promise<Response<{ orderId: string }>> {
    return api('/donations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amountKopecks: 10_000, channel: 'transfer', ...body }),
    });
  }

  describe('POST /donations с атрибуцией', () => {
    test('first, last и Referer пишутся в pending-донат нормализованными', async () => {
      // Act
      const response = await postDonation({
        howDidYouHear: 'friends',
        attribution: {
          first: { campaign: 'Oct' },
          last: { source: 'Instagram', medium: 'Stories' },
          referrer: 'https://t.me/',
          landingPage: '/02/',
          firstTouchAt: new Date(Date.now() - 60_000).toISOString(),
        },
      });

      // Assert
      expect(response.status).toBe(201);

      const stored = await prisma.donation.findUniqueOrThrow({ where: { id: response.body.orderId } });

      expect(stored).toMatchObject({
        status: 'pending',
        utmSource: 'telegram',
        utmMedium: 'referral',
        utmCampaign: 'oct',
        lastUtmSource: 'instagram',
        lastUtmMedium: 'stories',
        landingPage: '/02/',
        howDidYouHear: 'friends',
      });
      expect(stored.firstTouchAt).not.toBeNull();
    });

    test('старое поле utm от закэшированного фронта всё ещё принимается', async () => {
      // Act
      const response = await postDonation({ utm: { source: 'vk', landingPage: '/' } });

      // Assert
      expect(response.status).toBe(201);
      expect(
        await prisma.donation.findUniqueOrThrow({ where: { id: response.body.orderId }, select: { utmSource: true } }),
      ).toEqual({ utmSource: 'vk' });
    });

    test.each([
      ['лишнее поле в атрибуции', { attribution: { first: { source: 'vk' }, gclid: 'x' } }],
      ['метка с e-mail', { attribution: { first: { source: 'a@b.ru' } } }],
      ['utm и attribution вместе', { utm: { source: 'vk' }, attribution: { first: { source: 'tg' } } }],
    ])('%s — 400 и ни одного заказа', async (_case, body) => {
      // Act
      const response = await postDonation(body);

      // Assert
      expect(response.status).toBe(400);
      expect(await prisma.donation.count()).toBe(0);
    });
  });

  describe('GET /go/:slug', () => {
    beforeEach(async () => {
      await prisma.shortLink.create({
        data: { slug: 'qr-mosque', title: 'QR у входа', targetPath: '/02/', utmSource: 'qr', utmMedium: 'offline' },
      });
    });

    test('302 на сайт с метками, без кэша, клик засчитан', async () => {
      // Act
      const response = await api('/go/qr-mosque', { headers: { 'User-Agent': BROWSER_UA } });

      // Assert
      expect(response.status).toBe(302);
      expect(response.headers.get('location')).toBe(`${E2E_SITE_URL}/02/?utm_source=qr&utm_medium=offline`);
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect((await prisma.shortLink.findUniqueOrThrow({ where: { slug: 'qr-mosque' } })).clicks).toBe(1);
    });

    test('превью Telegram получает редирект, но клик не считается', async () => {
      // Act
      const response = await api('/go/qr-mosque', { headers: { 'User-Agent': 'TelegramBot (like TwitterBot)' } });

      // Assert
      expect(response.status).toBe(302);
      expect((await prisma.shortLink.findUniqueOrThrow({ where: { slug: 'qr-mosque' } })).clicks).toBe(0);
    });

    test.each(['unknown', 'QR-MOSQUE', 'a--b', 'x'.repeat(65)])('слаг «%s» — 302 на главную, без ошибки наружу', async (slug) => {
      // Act
      const response = await api(`/go/${slug}`, { headers: { 'User-Agent': BROWSER_UA } });

      // Assert
      expect(response.status).toBe(302);
      expect(response.headers.get('location')).toBe(`${E2E_SITE_URL}/`);
    });
  });

  describe('админка', () => {
    test('редактор заводит короткую ссылку, ссылку с кликом удалить нельзя', async () => {
      // Arrange
      const headers = await login(AdminRole.EDITOR);

      // Act
      const created = await api<ShortLinkBody>('/admin/short-links', {
        method: 'POST',
        headers,
        body: JSON.stringify({ slug: 'tg-post', title: 'Пост в канале', utmSource: 'Telegram', utmCampaign: 'Oct' }),
      });
      await api('/go/tg-post', { headers: { 'User-Agent': BROWSER_UA } });
      const removed = await api(`/admin/short-links/${created.body.id}`, { method: 'DELETE', headers });

      // Assert
      expect(created.status).toBe(201);
      expect(created.body.shortUrl).toBe(`${E2E_SITE_URL}/go/tg-post`);
      expect(created.body.targetUrl).toBe(`${E2E_SITE_URL}/?utm_source=telegram&utm_campaign=oct`);
      expect(removed.status).toBe(409);
    });

    test('ссылка на чужой домен отклоняется валидацией — 400', async () => {
      // Arrange
      const headers = await login(AdminRole.EDITOR);

      // Act
      const response = await api('/admin/short-links', {
        method: 'POST',
        headers,
        body: JSON.stringify({ slug: 'evil', title: 'x', utmSource: 'qr', targetPath: '//evil.example' }),
      });

      // Assert
      expect(response.status).toBe(400);
    });

    test('бухгалтер не правит короткие ссылки — 403', async () => {
      // Arrange
      const headers = await login(AdminRole.ACCOUNTANT);

      // Act
      const response = await api('/admin/short-links', {
        method: 'POST',
        headers,
        body: JSON.stringify({ slug: 'acc', title: 'x', utmSource: 'qr' }),
      });

      // Assert
      expect(response.status).toBe(403);
    });

    test('отчёт по источникам считает только оплаченные донаты', async () => {
      // Arrange
      const headers = await login(AdminRole.ACCOUNTANT);
      const paid = await postDonation({ attribution: { first: { source: 'telegram' } } });
      await postDonation({ attribution: { first: { source: 'instagram' } } });
      const unattributed = await postDonation({});
      const paidAt = new Date(Date.now() - 60_000);
      await markPaid(prisma, paid.body.orderId, 10_000n, paidAt);
      await markPaid(prisma, unattributed.body.orderId, 10_000n, paidAt);

      // Act
      const report = await api<ReportBody>('/admin/analytics/donations-by-source?model=first', { headers });

      // Assert
      expect(report.status).toBe(200);
      expect(report.body.rows).toEqual([{ source: 'telegram', count: 1, totalKopecks: '10000', averageKopecks: '10000' }]);
      expect(report.body.unattributed.count).toBe(1);
    });

    test('недопустимая модель отчёта — 400', async () => {
      // Arrange
      const headers = await login(AdminRole.SUPER_ADMIN);

      // Act
      const report = await api('/admin/analytics/donations-by-source?model=linear', { headers });

      // Assert
      expect(report.status).toBe(400);
    });
  });
});
