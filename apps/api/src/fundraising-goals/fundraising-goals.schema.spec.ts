import type { PrismaClient } from '../generated/prisma/client';
import { createTestClient, describeDatabase } from '../database/testing/test-database';

/**
 * Страховка от потери объектов миграции этапов: частичный уникальный индекс
 * и триггеры Prisma в schema.prisma не выражает, и очередная сгенерированная
 * миграция может их молча уронить. На индексе держится «активный этап один».
 */
describeDatabase('гарантии схемы этапов сбора', () => {
  let prisma: PrismaClient;

  beforeAll(() => {
    prisma = createTestClient();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  test('частичный уникальный индекс по ACTIVE на месте', async () => {
    // Act
    const rows = await prisma.$queryRawUnsafe<{ indexdef: string }[]>(
      `SELECT indexdef FROM pg_indexes WHERE indexname = 'fundraising_goal_single_active'`,
    );

    // Assert
    expect(rows).toHaveLength(1);
    expect(rows[0]?.indexdef).toMatch(/UNIQUE INDEX .* WHERE \(status = 'ACTIVE'::fundraising_goal_status\)/);
  });

  test('триггеры статуса и запрета удаления на месте', async () => {
    const rows = await prisma.$queryRawUnsafe<{ tgname: string }[]>(
      `SELECT tgname FROM pg_trigger WHERE NOT tgisinternal AND tgrelid = 'fundraising_goal'::regclass`,
    );

    expect(rows.map((row) => row.tgname).sort()).toEqual([
      'fundraising_goal_status_guard_bd',
      'fundraising_goal_status_guard_bu',
    ]);
  });

  test('CHECK-ограничения на месте', async () => {
    const rows = await prisma.$queryRawUnsafe<{ conname: string }[]>(
      `SELECT conname FROM pg_constraint WHERE conrelid = 'fundraising_goal'::regclass AND contype = 'c'`,
    );

    expect(rows.map((row) => row.conname).sort()).toEqual([
      'fundraising_goal_adjustment_range',
      'fundraising_goal_completed_at',
      'fundraising_goal_description_length',
      'fundraising_goal_period_order',
      'fundraising_goal_target_range',
      'fundraising_goal_title_length',
    ]);
  });
});
