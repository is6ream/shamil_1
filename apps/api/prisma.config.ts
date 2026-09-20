import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import { defineConfig } from 'prisma/config';

/**
 * Конфигурация Prisma CLI. В Prisma 7 строка подключения живёт здесь, а не
 * в schema.prisma, и .env больше не подхватывается сам — грузим его явно.
 *
 * Уже заданные переменные окружения приоритетнее файла (так работает
 * `process.loadEnvFile`), поэтому миграции тестовой базы запускаются так:
 *   DATABASE_URL=$TEST_DATABASE_URL npx prisma migrate deploy
 */
const rootEnvFile = resolve(__dirname, '../../.env');

if (existsSync(rootEnvFile)) {
  process.loadEnvFile(rootEnvFile);
}

const databaseUrl = process.env.DATABASE_URL;

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    // Сиды — тот же код, что уезжает в dist: на проде их запускают без dev-зависимостей
    // через `node dist/database/seed/index.js` (день 16, «заполнение стартовых данных»).
    seed: 'npx tsx src/database/seed/index.ts',
  },
  // `prisma generate` базу не трогает и не должен требовать DATABASE_URL:
  // иначе `npm ci && npm run build` на чистой машине падает без .env.
  // Командам миграций datasource нужен — они сами скажут, если его нет.
  datasource: databaseUrl === undefined ? undefined : { url: databaseUrl },
});
