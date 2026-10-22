import { CAMPAIGN_SLUG } from '../database/seed/campaign.data';
import {
  TEST_ADMIN_PASSWORD,
  createTestAdmin,
  createTestClient,
  describeDatabase,
  resetDatabase,
  seedFixtures,
} from '../database/testing/test-database';
import type { PrismaClient } from '../generated/prisma/client';
import { AdminRole } from '../generated/prisma/enums';
import { E2E_SITE_URL, startE2eApp } from './testing/e2e-app';
import type { E2eApp } from './testing/e2e-app';

/**
 * Этапы сбора сквозь HTTP: публичный `GET /api/public/goals/active` без
 * авторизации, админские маршруты под JWT и ролями, валидация тел.
 */

interface Response<T> {
  readonly status: number;
  readonly body: T;
  readonly text: string;
}

interface PublicGoal {
  readonly id: string;
  readonly title: string;
  readonly collectedAmountKopecks: string;
  readonly percent: number;
  readonly isReached: boolean;
}

const SOME_UUID = '00000000-0000-4000-8000-000000000001';

describeDatabase('этапы сбора: сквозные сценарии', () => {
  let e2e: E2eApp;
  let prisma: PrismaClient;
  let clientNo = 0;

  jest.setTimeout(60_000);

  beforeAll(async () => {
    prisma = createTestClient();
    e2e = await startE2eApp(() => ({
      PAYMENT_PROVIDER: 'manual',
      PAYMENT_EMULATOR_ENABLED: 'false',
      // Сайта в e2e нет: ревалидация уходит на закрытый порт и сразу получает отказ.
      WEB_REVALIDATE_URL: 'http://127.0.0.1:9/api/revalidate',
      REVALIDATE_SECRET: 'e2e-revalidate-secret'.padEnd(32, 'x'),
      CORS_ORIGINS: E2E_SITE_URL,
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
    const body = (text.length > 0 && response.headers.get('content-type')?.includes('json') === true
      ? JSON.parse(text)
      : null) as T;

    return { status: response.status, body, text };
  }

  async function login(role: AdminRole): Promise<string> {
    const email = `${role.toLowerCase()}@example.test`;
    await createTestAdmin(prisma, { email, role });
    clientNo += 1;

    const response = await api<{ accessToken: string }>('/admin/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': `10.9.0.${clientNo}` },
      body: JSON.stringify({ email, password: TEST_ADMIN_PASSWORD }),
    });

    expect(response.status).toBe(200);

    return response.body.accessToken;
  }

  function send(token: string, method: string, body?: unknown): RequestInit {
    return {
      method,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    };
  }

  test('публичный эндпоинт без авторизации: этапа нет — 200 и пустой ответ', async () => {
    // Act
    const response = await api<PublicGoal | null>('/public/goals/active');

    // Assert
    expect(response.status).toBe(200);
    expect(response.body).toBeNull();
  });

  test.each([
    ['GET', '/admin/goals'],
    ['GET', `/admin/goals/${SOME_UUID}`],
    ['POST', '/admin/goals'],
    ['PATCH', `/admin/goals/${SOME_UUID}`],
    ['POST', `/admin/goals/${SOME_UUID}/activate`],
    ['POST', `/admin/goals/${SOME_UUID}/complete`],
    ['POST', `/admin/goals/${SOME_UUID}/archive`],
  ])('%s %s без токена — 401', async (method, path) => {
    expect((await api(path, { method })).status).toBe(401);
  });

  test('бухгалтер видит список, но менять этапы не может — 403', async () => {
    // Arrange
    const token = await login(AdminRole.ACCOUNTANT);

    // Act
    const list = await api('/admin/goals', send(token, 'GET'));
    const create = await api('/admin/goals', send(token, 'POST', { title: 'На кирпичи', targetAmountKopecks: '70000000' }));

    // Assert
    expect(list.status).toBe(200);
    expect(create.status).toBe(403);
  });

  test('валидация тела: лишнее поле, HTML, сумма вне диапазона — 400', async () => {
    // Arrange
    const token = await login(AdminRole.EDITOR);
    const valid = { title: 'На кирпичи', targetAmountKopecks: '70000000' };

    // Act
    const extra = await api('/admin/goals', send(token, 'POST', { ...valid, status: 'ACTIVE' }));
    const html = await api('/admin/goals', send(token, 'POST', { ...valid, title: '<img src=x>' }));
    const tooSmall = await api('/admin/goals', send(token, 'POST', { ...valid, targetAmountKopecks: '99999' }));
    const tooBig = await api('/admin/goals', send(token, 'POST', { ...valid, targetAmountKopecks: '10000000001' }));
    const badId = await api('/admin/goals/not-a-uuid/activate', send(token, 'POST'));

    // Assert
    expect([extra.status, html.status, tooSmall.status, tooBig.status, badId.status]).toEqual([400, 400, 400, 400, 400]);
  });

  test('создать → активировать → корректировка → главная видит прогресс → архив убирает этап', async () => {
    // Arrange
    const token = await login(AdminRole.EDITOR);

    // Act
    const created = await api<{ id: string; status: string }>(
      '/admin/goals',
      send(token, 'POST', { title: '  На кирпичи ', targetAmountKopecks: '70000000' }),
    );
    const activated = await api<{ status: string }>(`/admin/goals/${created.body.id}/activate`, send(token, 'POST'));
    const patched = await api(`/admin/goals/${created.body.id}`, send(token, 'PATCH', { manualAdjustmentKopecks: '35000000' }));
    const visible = await api<PublicGoal>('/public/goals/active');
    const archived = await api(`/admin/goals/${created.body.id}/archive`, send(token, 'POST'));
    const hidden = await api<PublicGoal | null>('/public/goals/active');

    // Assert
    expect(created.status).toBe(201);
    expect(created.body.status).toBe('DRAFT');
    expect(activated.status).toBe(200);
    expect(activated.body.status).toBe('ACTIVE');
    expect(patched.status).toBe(200);
    expect(visible.body).toMatchObject({
      id: created.body.id,
      title: 'На кирпичи',
      collectedAmountKopecks: '35000000',
      percent: 50,
      isReached: false,
    });
    expect(Object.keys(visible.body).sort()).toEqual(
      ['collectedAmountKopecks', 'description', 'id', 'isReached', 'percent', 'targetAmountKopecks', 'title'],
    );
    expect(archived.status).toBe(200);
    expect(hidden.body).toBeNull();
  });

  test('физического удаления нет: DELETE — 404', async () => {
    const token = await login(AdminRole.SUPER_ADMIN);

    expect((await api(`/admin/goals/${SOME_UUID}`, send(token, 'DELETE'))).status).toBe(404);
  });
});
