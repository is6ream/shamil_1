import { describeDatabase } from '../database/testing/test-database';
import { startE2eApp } from './testing/e2e-app';
import type { E2eApp } from './testing/e2e-app';

/**
 * Рубильник кабинета: при `DONOR_CABINET_ENABLED=false` (значение по умолчанию,
 * так сейчас работает прод) маршрутов `/donor/*` нет вовсе, а приложение
 * стартует без ключей кабинета и почты.
 */
describeDatabase('кабинет жертвователя выключен', () => {
  let e2e: E2eApp;

  beforeAll(async () => {
    e2e = await startE2eApp(() => ({
      PAYMENT_PROVIDER: 'manual',
      PAYMENT_EMULATOR_ENABLED: 'false',
      DONOR_CABINET_ENABLED: 'false',
      WEB_REVALIDATE_URL: 'http://127.0.0.1:9/api/revalidate',
      STORAGE_DRIVER: 'local',
    }));
  });

  afterAll(async () => {
    await e2e.close();
  });

  test.each([
    ['POST', '/donor/auth/request-code'],
    ['GET', '/donor/me'],
    ['POST', '/donor/subscriptions'],
    ['POST', '/donor/subscriptions/cancel-by-link'],
  ])('%s %s — 404', async (method, path) => {
    // Act
    const response = await fetch(`${e2e.apiUrl}${path}`, { method });

    // Assert
    expect(response.status).toBe(404);
  });
});
