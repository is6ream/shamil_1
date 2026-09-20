import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import { Client } from 'pg';

/**
 * Подготовка тестовой базы перед запуском Jest.
 *
 * Тесты схемы (переходы статуса, идемпотентность вебхука, витринные счётчики)
 * проверяют гарантии самого PostgreSQL — триггеры, CHECK, уникальные индексы.
 * Подменять их моками бессмысленно: проверять тогда нечего.
 *
 * Поэтому: если `TEST_DATABASE_URL` задан и база отвечает, она создаётся
 * (при необходимости), на неё накатываются миграции и тесты идут полностью.
 * Если сервер недоступен — тесты на БД пропускаются с предупреждением,
 * а остальной набор остаётся зелёным.
 */
const API_ROOT = resolve(__dirname, '../../..');
const ROOT_ENV_FILE = resolve(API_ROOT, '../../.env');
const PRISMA_CLI = resolve(API_ROOT, '../../node_modules/prisma/build/index.js');
const CONNECT_TIMEOUT_MS = 3_000;

/** Флаг для `describeDatabase`: тесты на БД имеют смысл. */
export const DB_TESTS_ENV_FLAG = 'SHAMIL_DB_TESTS';

function skip(reason: string): void {
  process.stdout.write(
    `\n⚠ Тесты на БД пропущены: ${reason}\n` +
      '  Поднять базу:  npm run db:up  (из корня репозитория)\n' +
      '  Затем задать TEST_DATABASE_URL в .env — см. .env.example\n\n',
  );
}

/**
 * Тестовая база создаётся сама: одна команда `npm test` не должна требовать
 * ручных шагов, иначе их забудут и тесты «просто пропустятся».
 */
async function ensureDatabaseExists(connectionString: string): Promise<void> {
  const target = new URL(connectionString);
  const databaseName = decodeURIComponent(target.pathname.replace(/^\//, ''));

  const maintenance = new URL(connectionString);
  maintenance.pathname = '/postgres';

  const client = new Client({
    connectionString: maintenance.toString(),
    connectionTimeoutMillis: CONNECT_TIMEOUT_MS,
  });

  await client.connect();

  try {
    const existing = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [
      databaseName,
    ]);

    if (existing.rowCount === 0) {
      // Имя базы в кавычках: параметризовать идентификатор SQL не умеет.
      await client.query(`CREATE DATABASE "${databaseName.replace(/"/g, '""')}"`);
    }
  } finally {
    await client.end();
  }
}

export default async function globalSetup(): Promise<void> {
  if (existsSync(ROOT_ENV_FILE)) {
    process.loadEnvFile(ROOT_ENV_FILE);
  }

  const connectionString = process.env.TEST_DATABASE_URL;

  if (connectionString === undefined || connectionString.length === 0) {
    skip('TEST_DATABASE_URL не задан');

    return;
  }

  try {
    await ensureDatabaseExists(connectionString);

    execFileSync(process.execPath, [PRISMA_CLI, 'migrate', 'deploy'], {
      cwd: API_ROOT,
      // DATABASE_URL здесь важнее значения из .env: prisma.config.ts грузит файл
      // через process.loadEnvFile, а тот уже заданные переменные не перезаписывает.
      env: { ...process.env, DATABASE_URL: connectionString },
      stdio: 'pipe',
    });

    process.env[DB_TESTS_ENV_FLAG] = '1';
  } catch (error: unknown) {
    skip(error instanceof Error ? error.message : String(error));
  }
}
