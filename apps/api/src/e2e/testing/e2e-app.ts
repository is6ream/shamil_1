import { createServer } from 'node:net';

import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { configureApp } from '../../bootstrap';

/**
 * Настоящее приложение на настоящем порту — для сквозных тестов.
 *
 * Порт нужен до старта: из `PUBLIC_API_URL` собирается Result URL, на который
 * эмулятор шлёт колбэк настоящим HTTP-запросом, а конфиг читается один раз.
 * Поэтому: свободный порт → окружение → импорт `AppModule` → listen.
 * Импорт динамический: `ConfigModule.forRoot` и условный модуль эмулятора
 * читают окружение в момент импорта, и статический импорт увидел бы чужое.
 */

export interface E2eApp {
  readonly app: INestApplication;
  /** `http://127.0.0.1:<port>/api` */
  readonly apiUrl: string;
  readonly close: () => Promise<void>;
}

export function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();

    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();

      server.close(() => {
        if (address === null || typeof address === 'string') {
          reject(new Error('Не удалось получить свободный порт'));

          return;
        }

        resolve(address.port);
      });
    });
  });
}

/** Сайт, на который эмулятор возвращает донатера. Сам сайт в тестах не нужен — читаем Location. */
export const E2E_SITE_URL = 'http://localhost:3999';

export const E2E_ADMIN_TOKEN = 'e2e-admin-token-'.padEnd(40, 'x');

export async function startE2eApp(
  env: (port: number) => Readonly<Record<string, string>>,
): Promise<E2eApp> {
  const databaseUrl = process.env.TEST_DATABASE_URL;

  if (databaseUrl === undefined || databaseUrl.length === 0) {
    throw new Error('TEST_DATABASE_URL не задан');
  }

  const port = await findFreePort();
  const origin = `http://127.0.0.1:${port}`;

  Object.assign(process.env, {
    NODE_ENV: 'test',
    DATABASE_URL: databaseUrl,
    API_PORT: String(port),
    PUBLIC_API_URL: origin,
    PUBLIC_SITE_URL: E2E_SITE_URL,
    ADMIN_API_TOKEN: E2E_ADMIN_TOKEN,
    PAYMENT_RECEIPT_ENABLED: 'false',
    ...env(port),
  });

  const { AppModule } = await import('../../app.module');
  const app = await NestFactory.create(AppModule, { rawBody: true, logger: ['error', 'warn'] });

  configureApp(app);
  await app.listen(port, '127.0.0.1');

  return { app, apiUrl: `${origin}/api`, close: () => app.close() };
}

/** Окружение эмулятора — ровно то, что README предлагает вписать в `.env`. */
export function emulatorEnv(port: number): Readonly<Record<string, string>> {
  return {
    PAYMENT_PROVIDER: 'robokassa',
    PAYMENT_IS_TEST: 'true',
    PAYMENT_MERCHANT_ID: 'shamil-local',
    PAYMENT_TEST_SECRET_KEY: 'e2e-password-1',
    PAYMENT_TEST_WEBHOOK_SECRET: 'e2e-password-2',
    PAYMENT_HASH_ALGORITHM: 'md5',
    PAYMENT_ROBOKASSA_URL: `http://127.0.0.1:${port}/api/dev/robokassa/checkout`,
    PAYMENT_EMULATOR_ENABLED: 'true',
  };
}

/** Ссылка кнопки со страницы эмулятора по её подписи. */
export function findLink(html: string, label: string): string {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`href="([^"]+)">${escaped}<`).exec(html);

  if (match?.[1] === undefined) {
    throw new Error(`На странице эмулятора нет ссылки «${label}»`);
  }

  return match[1].replace(/&amp;/g, '&');
}

export async function waitFor<T>(
  probe: () => Promise<T>,
  isDone: (value: T) => boolean,
  timeoutMs: number,
  intervalMs = 250,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let value = await probe();

  while (!isDone(value) && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
    value = await probe();
  }

  return value;
}
