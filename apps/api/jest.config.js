/**
 * Конфигурация тестов бэкенда.
 *
 * Вынесена из package.json, потому что каждому пункту тут нужен комментарий.
 *
 * @type {import('jest').Config}
 */
module.exports = {
  rootDir: 'src',
  moduleFileExtensions: ['js', 'json', 'ts'],
  testRegex: '.*\\.spec\\.ts$',
  transform: { '^.+\\.(t|j)s$': 'ts-jest' },
  testEnvironment: 'node',
  moduleNameMapper: { '^@/(.*)$': '<rootDir>/$1' },

  // Декораторы class-validator и DI Nest читают метаданные через Reflect.
  // В приложении полифилл подтягивает @nestjs/core, в тестах его нет:
  // без этой строки падает всё, что валидирует окружение и DTO.
  setupFiles: ['reflect-metadata'],

  // Готовит тестовую базу: создаёт её при необходимости и накатывает миграции.
  // Если базы нет, тесты на схему пропускаются с предупреждением, а остальные идут.
  globalSetup: '<rootDir>/database/testing/global-setup.ts',

  // Тесты схемы работают с одной тестовой базой и очищают таблицы целиком:
  // параллельные файлы ловят deadlock на TRUNCATE. Набор маленький —
  // последовательный прогон дешевле, чем изоляция по схемам.
  maxWorkers: 1,

  coverageDirectory: '../coverage',
  // Порог для нового кода (офлайн-конверсии Метрики). Действует при `npm run test:cov`;
  // считается вместе с тестами на БД — без поднятой базы интеграционные тесты
  // пропускаются, и порог честно не сходится. Непокрытый остаток — ветки
  // метаданных декораторов TypeScript в конструкторах, а не логика.
  // Ключ Jest разрешает от cwd (`path.resolve`), а не от rootDir: `npm run test:cov`
  // идёт из apps/api, поэтому путь — с `src/`. С `./metrika/` порог не находил
  // файлов и ронял прогон «Coverage data … was not found».
  coverageThreshold: {
    './src/metrika/': { lines: 90, branches: 90, functions: 90, statements: 90 },
  },
  collectCoverageFrom: [
    '**/*.(t|j)s',
    '!**/*.spec.ts',
    '!main.ts',
    // Сгенерированный клиент Prisma, тестовые утилиты и сиды — не продуктовый код.
    '!generated/**',
    '!**/testing/**',
    '!database/seed/**',
  ],
};
