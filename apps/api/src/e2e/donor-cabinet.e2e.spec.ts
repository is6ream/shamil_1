import { BillingService } from '../billing/billing.service';
import { CAMPAIGN_SLUG } from '../database/seed/campaign.data';
import {
  createTestAdmin,
  createTestClient,
  describeDatabase,
  resetDatabase,
  seedFixtures,
  TEST_ADMIN_PASSWORD,
} from '../database/testing/test-database';
import type { PrismaClient } from '../generated/prisma/client';
import { DonationStatus, DonationType, SubscriptionStatus } from '../generated/prisma/enums';
import type { LogMailSender } from '../mail/log-mail.sender';
import { MAIL_SENDER } from '../mail/mail.types';
import { emulatorEnv, findLink, startE2eApp, waitFor } from './testing/e2e-app';
import type { E2eApp } from './testing/e2e-app';

/**
 * Кабинет жертвователя целиком, как его пройдёт человек: код на почту →
 * вход → ежемесячное пожертвование через эмулятор Robokassa → автосписание
 * планировщиком (рекуррент + колбэк на Result URL) → история → отмена по
 * ссылке из письма. Плюс границы: чужая подписка, чужие токены.
 */

interface Response<T> {
  readonly status: number;
  readonly body: T;
  readonly headers: Headers;
}

describeDatabase('кабинет жертвователя: сквозной сценарий', () => {
  let e2e: E2eApp;
  let prisma: PrismaClient;
  let mail: LogMailSender;

  jest.setTimeout(90_000);

  beforeAll(async () => {
    prisma = createTestClient();
    e2e = await startE2eApp((port) => ({
      ...emulatorEnv(port),
      PAYMENT_ROBOKASSA_RECURRING_URL: `http://127.0.0.1:${port}/api/dev/robokassa/recurring`,
      PAYMENT_ROBOKASSA_OPSTATE_URL: `http://127.0.0.1:${port}/api/dev/robokassa/opstate`,
      RECURRING_EMULATOR_OUTCOME: 'paid',
      DONOR_CABINET_ENABLED: 'true',
      MAIL_TRANSPORT: 'log',
      // Планировщик в тестах не крутится сам — тик вызывается руками.
      BILLING_SCHEDULER_ENABLED: 'false',
      ADMIN_JWT_SECRET: 'e2e-admin-jwt-'.padEnd(48, 'a'),
      WEB_REVALIDATE_URL: 'http://127.0.0.1:9/api/revalidate',
      STORAGE_DRIVER: 'local',
    }));
    mail = e2e.app.get<LogMailSender>(MAIL_SENDER);
  });

  afterAll(async () => {
    await e2e.close();
    await prisma.$disconnect();

    // Окружение процесса общее для файлов e2e: кабинет не должен остаться включённым у соседей.
    for (const name of ['DONOR_CABINET_ENABLED', 'PAYMENT_ROBOKASSA_RECURRING_URL', 'PAYMENT_ROBOKASSA_OPSTATE_URL', 'RECURRING_EMULATOR_OUTCOME']) {
      delete process.env[name];
    }
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    await seedFixtures(prisma, { campaignSlug: CAMPAIGN_SLUG });
  });

  async function api<T>(path: string, init: RequestInit = {}, token?: string): Promise<Response<T>> {
    const headers = new Headers(init.headers);

    if (init.body !== undefined) {
      headers.set('Content-Type', 'application/json');
    }

    if (token !== undefined) {
      headers.set('Authorization', `Bearer ${token}`);
    }

    const response = await fetch(`${e2e.apiUrl}${path}`, { ...init, headers });
    const text = await response.text();

    return { status: response.status, body: (text.length > 0 ? JSON.parse(text) : null) as T, headers: response.headers };
  }

  async function login(email: string): Promise<string> {
    const requested = await api('/donor/auth/request-code', { method: 'POST', body: JSON.stringify({ email }) });
    expect(requested.status).toBe(202);

    const letter = [...mail.outbox()].reverse().find((m) => m.to === email && m.kind === 'login_code');
    const code = /(\d{6})/.exec(letter?.subject ?? '')?.[1] ?? '';
    const verified = await api<{ accessToken: string }>('/donor/auth/verify', {
      method: 'POST',
      body: JSON.stringify({ email, code }),
    });

    expect(verified.status).toBe(200);
    expect(verified.headers.get('set-cookie')).toMatch(/shamil_donor_rt=.*HttpOnly/i);

    return verified.body.accessToken;
  }

  async function subscribeAndPay(token: string): Promise<string> {
    const created = await api<{ subscriptionId: string; redirectUrl: string }>(
      '/donor/subscriptions',
      { method: 'POST', body: JSON.stringify({ amountKopecks: 50_000, regionSlug: '02', recurringConsent: true }) },
      token,
    );

    expect(created.status).toBe(201);
    expect(new URL(created.body.redirectUrl).searchParams.get('Recurring')).toBe('true');

    const checkout = await fetch(created.body.redirectUrl);
    expect(checkout.status).toBe(200);
    await fetch(findLink(await checkout.text(), 'Оплатить: Карта'), { redirect: 'manual' });

    await waitFor(
      () => prisma.subscription.findUniqueOrThrow({ where: { id: created.body.subscriptionId } }),
      (subscription) => subscription.status === SubscriptionStatus.ACTIVE,
      10_000,
    );

    return created.body.subscriptionId;
  }

  test('вход → подписка → автосписание → история → отмена по ссылке из письма', async () => {
    // Arrange
    const token = await login('donor@example.test');
    const subscriptionId = await subscribeAndPay(token);
    await prisma.subscription.update({ where: { id: subscriptionId }, data: { nextChargeAt: new Date(Date.now() - 1000) } });

    // Act: тик планировщика → рекуррент в эмулятор → колбэк на Result URL
    await e2e.app.get(BillingService).runTick();
    await waitFor(
      () => prisma.donation.findMany({ where: { subscriptionId, type: DonationType.CHILD } }),
      (rows) => rows.length === 1 && rows[0]?.status === DonationStatus.paid,
      10_000,
    );

    // Assert: история в кабинете
    const history = await api<{ items: { type: string; status: string }[]; total: number }>('/donor/donations', {}, token);
    expect(history.status).toBe(200);
    expect(history.body.total).toBe(2);
    expect(history.body.items.map((item) => `${item.type}:${item.status}`).sort()).toEqual(['CHILD:paid', 'PARENT:paid']);

    // Act: отмена по ссылке из последнего письма — без входа
    const letter = [...mail.outbox()].reverse().find((m) => m.kind === 'charge_succeeded');
    const cancelUrl = new URL(/https?:\/\/\S+\/cabinet\/cancel\?token=\S+/.exec(letter?.text ?? '')?.[0] ?? 'http://x');
    const cancelled = await api('/donor/subscriptions/cancel-by-link', {
      method: 'POST',
      body: JSON.stringify({ token: cancelUrl.searchParams.get('token') }),
    });

    // Assert
    expect(cancelled.status).toBe(200);
    const list = await api<{ status: string }[]>('/donor/subscriptions', {}, token);
    expect(list.body[0]?.status).toBe(SubscriptionStatus.CANCELLED);
  });

  test('чужая подписка — 404 на чтение, правку и отмену', async () => {
    // Arrange
    const owner = await login('owner@example.test');
    const stranger = await login('stranger@example.test');
    const subscriptionId = await subscribeAndPay(owner);

    // Act
    const statuses = await Promise.all([
      api(`/donor/subscriptions/${subscriptionId}`, {}, stranger),
      api(`/donor/subscriptions/${subscriptionId}`, { method: 'PATCH', body: JSON.stringify({ paused: true }) }, stranger),
      api(`/donor/subscriptions/${subscriptionId}/cancel`, { method: 'POST' }, stranger),
    ]);

    // Assert
    expect(statuses.map((response) => response.status)).toEqual([404, 404, 404]);
    const subscription = await prisma.subscription.findUniqueOrThrow({ where: { id: subscriptionId } });
    expect(subscription.status).toBe(SubscriptionStatus.ACTIVE);
  });

  test('пауза и возобновление: на паузе не списывается, после — следующий цикл в будущем', async () => {
    // Arrange
    const token = await login('donor@example.test');
    const subscriptionId = await subscribeAndPay(token);

    // Act
    const paused = await api<{ status: string }>(
      `/donor/subscriptions/${subscriptionId}`,
      { method: 'PATCH', body: JSON.stringify({ paused: true, amountKopecks: 100_000 }) },
      token,
    );
    const resumed = await api<{ status: string; nextChargeAt: string; amountKopecks: string }>(
      `/donor/subscriptions/${subscriptionId}`,
      { method: 'PATCH', body: JSON.stringify({ paused: false }) },
      token,
    );

    // Assert
    expect(paused.body.status).toBe(SubscriptionStatus.PAUSED);
    expect(resumed.body.status).toBe(SubscriptionStatus.ACTIVE);
    expect(resumed.body.amountKopecks).toBe('100000');
    expect(new Date(resumed.body.nextChargeAt).getTime()).toBeGreaterThan(Date.now());
  });

  test('токены не взаимозаменяемы: админский не пускает в кабинет, жертвователя — в админку', async () => {
    // Arrange
    const admin = await createTestAdmin(prisma);
    const adminLogin = await api<{ accessToken: string }>('/admin/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: admin.email, password: TEST_ADMIN_PASSWORD }),
    });
    const donorToken = await login('donor@example.test');

    // Act
    const adminInCabinet = await api('/donor/me', {}, adminLogin.body.accessToken);
    const donorInAdmin = await api('/admin/auth/me', {}, donorToken);

    // Assert
    expect(adminInCabinet.status).toBe(401);
    expect(donorInAdmin.status).toBe(401);
  });

  test('Swagger вне production описывает только /donor/*', async () => {
    // Act
    const response = await fetch(`${e2e.apiUrl}/docs-json`);
    const document = (await response.json()) as { paths: Record<string, unknown> };
    const paths = Object.keys(document.paths);

    // Assert
    expect(response.status).toBe(200);
    expect(paths).toContain('/api/donor/auth/request-code');
    expect(paths.every((path) => path.startsWith('/api/donor/'))).toBe(true);
  });

  test('разовый донат по-прежнему без периодичности: лишнее поле — 400', async () => {
    // Act
    const response = await api('/donations', {
      method: 'POST',
      body: JSON.stringify({ amountKopecks: 10_000, channel: 'online', frequency: 'monthly' }),
    });

    // Assert
    expect(response.status).toBe(400);
  });
});
