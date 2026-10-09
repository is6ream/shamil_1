import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import sharp from 'sharp';

import { REFRESH_COOKIE_NAME } from '../auth/auth.constants';
import { CAMPAIGN_SLUG } from '../database/seed/campaign.data';
import { seedContent } from '../database/seed/content.seed';
import {
  TEST_ADMIN_PASSWORD,
  createPendingDonation,
  createTestAdmin,
  createTestClient,
  describeDatabase,
  resetDatabase,
  seedFixtures,
} from '../database/testing/test-database';
import type { PrismaClient } from '../generated/prisma/client';
import { AdminRole } from '../generated/prisma/enums';
import { E2E_ADMIN_TOKEN, E2E_SITE_URL, startE2eApp } from './testing/e2e-app';
import type { E2eApp } from './testing/e2e-app';

/**
 * Сквозные проверки админки: настоящее приложение на порту, настоящая БД,
 * HTTP как у браузера — Bearer-токен, refresh-cookie, multipart.
 */

interface Response<T> {
  readonly status: number;
  readonly body: T;
  readonly headers: Headers;
}

interface Session {
  readonly accessToken: string;
  readonly cookie: string;
}

interface RouteLayer {
  readonly route?: { readonly path: string; readonly methods: Readonly<Record<string, boolean>> };
}

/** Маршруты, которым access-токен не нужен по замыслу: их защищают пароль и refresh-cookie. */
const PUBLIC_ADMIN_ROUTES = new Set(['POST /api/admin/auth/login', 'POST /api/admin/auth/logout']);

const SOME_UUID = '00000000-0000-4000-8000-000000000001';

describeDatabase('админка: сквозные сценарии', () => {
  let e2e: E2eApp;
  let prisma: PrismaClient;
  let mediaDir: string;

  jest.setTimeout(60_000);

  beforeAll(async () => {
    prisma = createTestClient();
    mediaDir = await mkdtemp(join(tmpdir(), 'shamil-e2e-media-'));
    e2e = await startE2eApp(() => ({
      PAYMENT_PROVIDER: 'manual',
      PAYMENT_EMULATOR_ENABLED: 'false',
      // Сайта в e2e нет: ревалидация уходит на закрытый порт и сразу получает отказ.
      WEB_REVALIDATE_URL: 'http://127.0.0.1:9/api/revalidate',
      STORAGE_DRIVER: 'local',
      MEDIA_LOCAL_DIR: mediaDir,
      MEDIA_MAX_UPLOAD_MB: '1',
      CORS_ORIGINS: E2E_SITE_URL,
    }));
  });

  afterAll(async () => {
    await e2e.close();
    await prisma.$disconnect();
    await rm(mediaDir, { recursive: true, force: true });
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    await seedFixtures(prisma, { campaignSlug: CAMPAIGN_SLUG });
    await seedContent(prisma);
  });

  async function api<T>(path: string, init: RequestInit = {}): Promise<Response<T>> {
    const response = await fetch(`${e2e.apiUrl}${path}`, init);
    const text = await response.text();
    const body = (text.length > 0 && response.headers.get('content-type')?.includes('json') === true
      ? JSON.parse(text)
      : text) as T;

    return { status: response.status, body, headers: response.headers };
  }

  function bearer(session: Session, extra: Record<string, string> = {}): Record<string, string> {
    return { Authorization: `Bearer ${session.accessToken}`, ...extra };
  }

  function json(session: Session, method: string, body: unknown): RequestInit {
    return { method, headers: bearer(session, { 'Content-Type': 'application/json' }), body: JSON.stringify(body) };
  }

  function readCookie(headers: Headers): string {
    const setCookie = headers.getSetCookie().find((value) => value.startsWith(`${REFRESH_COOKIE_NAME}=`));

    if (setCookie === undefined) {
      throw new Error('Ответ без refresh-cookie');
    }

    return setCookie.split(';')[0] ?? '';
  }

  /**
   * Каждый вход — со своего адреса: лимит входа 5 в минуту на IP работает
   * и в e2e. Адрес берётся из X-Forwarded-For — так же, как за балансировщиком Timeweb.
   */
  let clientNo = 0;

  function clientIp(): string {
    clientNo += 1;

    return `10.0.${Math.floor(clientNo / 250)}.${clientNo % 250}`;
  }

  async function login(role: AdminRole, email = `${role.toLowerCase()}@example.test`): Promise<Session> {
    await createTestAdmin(prisma, { email, role });

    const response = await api<{ accessToken: string }>('/admin/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': clientIp() },
      body: JSON.stringify({ email, password: TEST_ADMIN_PASSWORD }),
    });

    expect(response.status).toBe(200);

    return { accessToken: response.body.accessToken, cookie: readCookie(response.headers) };
  }

  function adminRoutes(): { method: string; path: string }[] {
    const router = (e2e.app.getHttpAdapter().getInstance() as { router: { stack: RouteLayer[] } }).router;

    return router.stack.flatMap((layer) => {
      const route = layer.route;

      if (route === undefined || !route.path.startsWith('/api/admin/')) {
        return [];
      }

      return Object.keys(route.methods).map((method) => ({
        method: method.toUpperCase(),
        path: route.path.replace(/:id/g, SOME_UUID).replace(/:key/g, 'hero'),
      }));
    });
  }

  test('лимит входа — 5 попыток в минуту с одного адреса', async () => {
    // Arrange
    const ip = clientIp();
    const attempt = (): Promise<Response<unknown>> =>
      api('/admin/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': ip },
        body: JSON.stringify({ email: 'nobody@example.test', password: 'wrong-password-1' }),
      });

    // Act
    const statuses: number[] = [];

    for (let index = 0; index < 6; index += 1) {
      statuses.push((await attempt()).status);
    }

    // Assert
    expect(statuses).toEqual([401, 401, 401, 401, 401, 429]);
  });

  test('каждый /api/admin/* без токена — 401 (перебор всех маршрутов приложения)', async () => {
    // Arrange
    const routes = adminRoutes().filter(({ method, path }) => !PUBLIC_ADMIN_ROUTES.has(`${method} ${path}`));

    // Act
    const results = await Promise.all(
      routes.map(async ({ method, path }) => {
        const response = await fetch(`${e2e.apiUrl.replace(/\/api$/, '')}${path}`, { method });

        return { route: `${method} ${path}`, status: response.status };
      }),
    );

    // Assert: маршрутов много, ни один не открыт
    expect(routes.length).toBeGreaterThan(40);
    expect(results.filter((result) => result.status !== 401)).toEqual([]);
  });

  test('чужой или испорченный токен — 401, а не 500', async () => {
    // Act
    const forged = await api('/admin/auth/me', { headers: { Authorization: 'Bearer eyJhbGciOiJub25lIn0.e30.' } });
    const garbage = await api('/admin/dashboard', { headers: { Authorization: 'Bearer not-a-jwt' } });

    // Assert
    expect(forged.status).toBe(401);
    expect(garbage.status).toBe(401);
  });

  test('вход → правка этапа → публичный /construction отдаёт новое', async () => {
    // Arrange
    const editor = await login(AdminRole.EDITOR);
    const stages = await api<{ id: string }[]>('/admin/stages', { headers: bearer(editor) });
    const first = stages.body[0];

    if (first === undefined) {
      throw new Error('Сид не создал этапы');
    }

    // Act
    const patched = await api(`/admin/stages/${first.id}`, json(editor, 'PATCH', { title: 'Проект утверждён', status: 'done' }));
    const construction = await api<{ stages: { id: string; title: string }[] }>('/construction');

    // Assert
    expect(patched.status).toBe(200);
    expect(construction.body.stages.find((stage) => stage.id === first.id)?.title).toBe('Проект утверждён');
  });

  test('загрузка фото → фото в галерее и раздаётся по /media', async () => {
    // Arrange
    const editor = await login(AdminRole.EDITOR);
    const photo = await sharp({ create: { width: 1200, height: 800, channels: 3, background: '#026AA9' } }).jpeg().toBuffer();
    const form = new FormData();
    form.append('file', new Blob([new Uint8Array(photo)], { type: 'image/jpeg' }), 'фундамент.jpg');
    form.append('altText', 'Заливка фундамента');

    // Act
    const uploaded = await api<{ id: string; urls: { lg: string } }>('/admin/media', {
      method: 'POST',
      headers: bearer(editor),
      body: form,
    });
    const created = await api('/admin/gallery', json(editor, 'POST', { mediaAssetId: uploaded.body.id, caption: 'Фундамент' }));
    const gallery = await api<{ url: string; caption: string }[]>('/gallery');
    const file = await fetch(uploaded.body.urls.lg);

    // Assert
    expect(uploaded.status).toBe(201);
    expect(created.status).toBe(201);
    expect(gallery.body).toEqual([expect.objectContaining({ url: uploaded.body.urls.lg, caption: 'Фундамент' })]);
    expect(file.status).toBe(200);
    expect(file.headers.get('content-type')).toBe('image/webp');
    expect(file.headers.get('cross-origin-resource-policy')).toBe('cross-origin');
  });

  test('файл больше лимита — 413, не-картинка — 400', async () => {
    // Arrange
    const editor = await login(AdminRole.EDITOR);
    const big = new FormData();
    big.append('file', new Blob([new Uint8Array(1024 * 1024 + 10)], { type: 'image/jpeg' }), 'big.jpg');
    const fake = new FormData();
    fake.append('file', new Blob(['#!/bin/sh\necho pwned'], { type: 'image/jpeg' }), 'photo.jpg');

    // Act
    const tooBig = await api('/admin/media', { method: 'POST', headers: bearer(editor), body: big });
    const notImage = await api('/admin/media', { method: 'POST', headers: bearer(editor), body: fake });

    // Assert
    expect(tooBig.status).toBe(413);
    expect(notImage.status).toBe(400);
    expect(await prisma.mediaAsset.count()).toBe(0);
  });

  test('ручное поступление → выросла сумма сбора на сайте', async () => {
    // Arrange
    const accountant = await login(AdminRole.ACCOUNTANT);
    const before = await api<{ collectedKopecks: string }>('/campaign');

    // Act
    const created = await api(
      '/admin/donations/manual',
      json(accountant, 'POST', {
        idempotencyKey: randomUUID(),
        amountKopecks: '250000',
        method: 'cash',
        comment: 'Наличные после джума-намаза',
      }),
    );
    const after = await api<{ collectedKopecks: string; donationsCount: number }>('/campaign');

    // Assert
    expect(created.status).toBe(201);
    expect(BigInt(after.body.collectedKopecks) - BigInt(before.body.collectedKopecks)).toBe(250_000n);
  });

  test('редактор видит маску ПДн и получает 403 на CSV; бухгалтер — данные и CSV', async () => {
    // Arrange
    const fixtures = await prisma.campaign.findUniqueOrThrow({ where: { slug: CAMPAIGN_SLUG } });
    const donation = await createPendingDonation(prisma, {
      campaignId: fixtures.id,
      russiaId: '',
      bashkortostanId: '',
      kazakhstanId: '',
    });
    await prisma.donationContact.create({
      data: { donationId: donation.id, phoneE164: '+79991234567', fullName: 'Иван Иванов', personalDataConsentAt: new Date() },
    });
    const editor = await login(AdminRole.EDITOR);
    const accountant = await login(AdminRole.ACCOUNTANT);

    // Act
    const editorList = await api<{ items: { contact: unknown }[] }>('/admin/donations', { headers: bearer(editor) });
    const editorCsv = await api('/admin/donations/export.csv', { headers: bearer(editor) });
    const accountantCsv = await api<string>('/admin/donations/export.csv', { headers: bearer(accountant) });

    // Assert
    expect(JSON.stringify(editorList.body)).not.toMatch(/79991234567|Иван/);
    expect(editorList.body.items[0]?.contact).toMatchObject({ phone: '•••', fullName: '•••' });
    expect(editorCsv.status).toBe(403);
    expect(accountantCsv.status).toBe(200);
    expect(accountantCsv.headers.get('content-type')).toContain('text/csv');
    expect(accountantCsv.body).toContain('Иван Иванов');
  });

  test('редактор не правит реквизиты и пользователей; журнал ему закрыт', async () => {
    // Arrange
    const editor = await login(AdminRole.EDITOR);

    // Act
    const requisites = await api('/admin/content/requisites', json(editor, 'PUT', { accountNumber: '40703810000000000001' }));
    const users = await api('/admin/users', { headers: bearer(editor) });
    const audit = await api('/admin/audit', { headers: bearer(editor) });

    // Assert
    expect(requisites.status).toBe(403);
    expect(users.status).toBe(403);
    expect(audit.status).toBe(403);
  });

  test('повтор использованного refresh-токена отзывает всё семейство', async () => {
    // Arrange
    const session = await login(AdminRole.SUPER_ADMIN);
    const rotated = await api<{ accessToken: string }>('/admin/auth/refresh', {
      method: 'POST',
      headers: { Cookie: session.cookie },
    });
    const freshCookie = readCookie(rotated.headers);

    // Act: старой cookie воспользовался кто-то ещё
    const reuse = await api('/admin/auth/refresh', { method: 'POST', headers: { Cookie: session.cookie } });
    const afterReuse = await api('/admin/auth/refresh', { method: 'POST', headers: { Cookie: freshCookie } });

    // Assert
    expect(rotated.status).toBe(200);
    expect(reuse.status).toBe(401);
    expect(afterReuse.status).toBe(401);
    expect(await prisma.adminRefreshToken.count({ where: { revokedAt: null } })).toBe(0);
  });

  test('refresh-cookie: HttpOnly, SameSite=Strict, Path=/api/admin/auth', async () => {
    // Arrange
    await createTestAdmin(prisma, { email: 'owner@example.test' });

    // Act
    const response = await api('/admin/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': clientIp() },
      body: JSON.stringify({ email: 'owner@example.test', password: TEST_ADMIN_PASSWORD }),
    });

    // Assert
    const cookie = response.headers.getSetCookie().join(';');
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Strict/i);
    expect(cookie).toMatch(/Path=\/api\/admin\/auth/);
    expect(JSON.stringify(response.body)).not.toContain(cookie.split(';')[0]?.split('=')[1] ?? 'none');
  });

  test('подтверждение перевода принимает и сессию, и старый ADMIN_API_TOKEN (D-07)', async () => {
    // Arrange
    const campaign = await prisma.campaign.findUniqueOrThrow({ where: { slug: CAMPAIGN_SLUG } });
    const fixtures = { campaignId: campaign.id, russiaId: '', bashkortostanId: '', kazakhstanId: '' };
    const viaSession = await createPendingDonation(prisma, fixtures);
    const viaToken = await createPendingDonation(prisma, fixtures);
    const accountant = await login(AdminRole.ACCOUNTANT);

    // Act
    const bySession = await api(`/admin/donations/${viaSession.id}/confirm`, json(accountant, 'POST', {}));
    const byToken = await api(`/admin/donations/${viaToken.id}/confirm`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${E2E_ADMIN_TOKEN}`, 'Content-Type': 'application/json' },
      body: '{}',
    });

    // Assert
    expect(bySession.status).toBe(200);
    expect(byToken.status).toBe(200);
    const entries = await prisma.auditLog.findMany({ where: { action: 'donation.confirm' }, orderBy: { occurredAt: 'asc' } });
    expect(entries.map((entry) => entry.actorType).sort()).toEqual(['system', 'user']);
  });

  test('CORS: сайт получает ответ с credentials, чужой origin — нет', async () => {
    // Act
    const allowed = await fetch(`${e2e.apiUrl}/admin/auth/refresh`, {
      method: 'OPTIONS',
      headers: { Origin: E2E_SITE_URL, 'Access-Control-Request-Method': 'POST' },
    });
    const foreign = await fetch(`${e2e.apiUrl}/admin/auth/refresh`, {
      method: 'OPTIONS',
      headers: { Origin: 'https://evil.example', 'Access-Control-Request-Method': 'POST' },
    });

    // Assert
    expect(allowed.headers.get('access-control-allow-origin')).toBe(E2E_SITE_URL);
    expect(allowed.headers.get('access-control-allow-credentials')).toBe('true');
    expect(foreign.headers.get('access-control-allow-origin')).toBeNull();
  });

  test('health/ready отвечает ok при живой БД и каталоге', async () => {
    // Act
    const ready = await api<{ status: string; checks: unknown }>('/health/ready');

    // Assert
    expect(ready.status).toBe(200);
    expect(ready.body).toEqual({ status: 'ok', checks: { database: 'ok', storage: 'ok' }, storageDriver: 'local' });
  });
});
