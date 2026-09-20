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

  // Готовит тестовую базу: создаёт её при необходимости и накатывает миграции.
  // Если базы нет, тесты на схему пропускаются с предупреждением, а остальные идут.
  globalSetup: '<rootDir>/database/testing/global-setup.ts',

  // Тесты схемы работают с одной тестовой базой и очищают таблицы целиком:
  // параллельные файлы ловят deadlock на TRUNCATE. Набор маленький —
  // последовательный прогон дешевле, чем изоляция по схемам.
  maxWorkers: 1,

  coverageDirectory: '../coverage',
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
