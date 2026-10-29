import { ModulesContainer } from '@nestjs/core';

import { BillingScheduler } from '../billing/billing.scheduler';
import { BillingService } from '../billing/billing.service';
import { describeDatabase } from '../database/testing/test-database';
import { DONOR_SWAGGER_PATH } from '../donor-cabinet/donor-swagger';
import { E2E_ADMIN_TOKEN, startE2eApp } from './testing/e2e-app';
import type { E2eApp } from './testing/e2e-app';

const SOME_ID = '00000000-0000-4000-8000-000000000000';

/**
 * Рубильник кабинета: при `DONOR_CABINET_ENABLED=false` (значение по умолчанию,
 * так сейчас работает прод) маршрутов `/donor/*` и `/admin/subscriptions` нет
 * вовсе, планировщик автосписаний не создаётся, Swagger не поднимается.
 *
 * Список маршрутов — все `@Controller` модулей кабинета: donor-auth,
 * donor-cabinet (включая отмену по ссылке), subscriptions, admin-subscriptions.
 * Новый маршрут кабинета обязан попасть сюда.
 */
describeDatabase('кабинет жертвователя выключен', () => {
  let e2e: E2eApp;

  beforeAll(async () => {
    e2e = await startE2eApp(() => ({
      PAYMENT_PROVIDER: 'manual',
      PAYMENT_EMULATOR_ENABLED: 'false',
      DONOR_CABINET_ENABLED: 'false',
      BILLING_SCHEDULER_ENABLED: 'false',
      SWAGGER_ENABLED: 'true',
      WEB_REVALIDATE_URL: 'http://127.0.0.1:9/api/revalidate',
      STORAGE_DRIVER: 'local',
    }));
  });

  afterAll(async () => {
    await e2e.close();
    // Окружение процесса общее для файлов e2e.
    delete process.env.SWAGGER_ENABLED;
  });

  test.each([
    // DonorAuthController
    ['POST', '/donor/auth/request-code'],
    ['POST', '/donor/auth/verify'],
    ['POST', '/donor/auth/refresh'],
    ['POST', '/donor/auth/logout'],
    // DonorCabinetController
    ['GET', '/donor/me'],
    ['PATCH', '/donor/me'],
    ['GET', '/donor/donations'],
    ['GET', '/donor/subscriptions'],
    ['GET', `/donor/subscriptions/${SOME_ID}`],
    ['PATCH', `/donor/subscriptions/${SOME_ID}`],
    ['POST', `/donor/subscriptions/${SOME_ID}/cancel`],
    // CancelByLinkController
    ['POST', '/donor/subscriptions/cancel-by-link'],
    // SubscriptionsController
    ['POST', '/donor/subscriptions'],
    // AdminSubscriptionsController — 404 даже с действующим админским токеном
    ['GET', '/admin/subscriptions'],
    ['GET', '/admin/subscriptions/stats'],
    ['POST', `/admin/subscriptions/${SOME_ID}/cancel`],
  ])('%s %s — 404', async (method, path) => {
    // Act
    const response = await fetch(`${e2e.apiUrl}${path}`, {
      method,
      headers: { authorization: `Bearer ${E2E_ADMIN_TOKEN}`, 'content-type': 'application/json' },
      body: method === 'GET' ? undefined : '{}',
    });

    // Assert
    expect(response.status).toBe(404);
  });

  test('планировщик и сервис автосписаний не созданы', () => {
    // app.get() неизвестного провайдера роняет процесс (abortOnError) — смотрим в контейнер модулей.
    const providers = [...e2e.app.get(ModulesContainer).values()].flatMap((module) => [...module.providers.keys()]);

    expect(providers).not.toContain(BillingScheduler);
    expect(providers).not.toContain(BillingService);
  });

  test('Swagger кабинета не поднимается, даже если SWAGGER_ENABLED=true', async () => {
    // Act
    const response = await fetch(`${e2e.apiUrl.replace(/\/api$/, '')}/${DONOR_SWAGGER_PATH}-json`);

    // Assert
    expect(response.status).toBe(404);
  });
});
