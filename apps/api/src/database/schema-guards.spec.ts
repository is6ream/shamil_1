import type { PrismaClient } from '../generated/prisma/client';
import {
  TEST_MONTHLY_GOAL_KOPECKS,
  TEST_MONTH_END,
  TEST_MONTH_START,
  createPendingDonation,
  createTestClient,
  describeDatabase,
  resetDatabase,
  seedFixtures,
} from './testing/test-database';
import type { TestFixtures } from './testing/test-database';

/**
 * Страховка от потери объектов второй миграции.
 *
 * Триггеры, CHECK и EXCLUDE Prisma в schema.prisma не выражает: при генерации
 * очередной миграции их легко не заметить и уронить вместе с таблицей.
 * На них держатся сумма сбора и запрет обратного перехода статуса, поэтому
 * их наличие проверяется тестом, а не доверием.
 */
describeDatabase('гарантии схемы', () => {
  let prisma: PrismaClient;
  let fixtures: TestFixtures;

  beforeAll(() => {
    prisma = createTestClient();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    fixtures = await seedFixtures(prisma);
  });

  test('триггеры статуса и витрин на месте', async () => {
    // Act
    const rows = await prisma.$queryRawUnsafe<{ tgname: string }[]>(
      'SELECT tgname FROM pg_trigger WHERE NOT tgisinternal',
    );
    const triggers = rows.map((row) => row.tgname);

    // Assert
    expect(triggers).toEqual(
      expect.arrayContaining([
        'donation_status_guard_bu',
        'donation_status_guard_bd',
        'donation_stats_sync_aiu',
        'campaign_stats_init_ai',
        'region_stats_init_ai',
      ]),
    );
  });

  test('CHECK-ограничения на месте', async () => {
    // Act
    const rows = await prisma.$queryRawUnsafe<{ conname: string }[]>(
      "SELECT conname FROM pg_constraint WHERE contype = 'c'",
    );
    const constraints = rows.map((row) => row.conname);

    // Assert
    expect(constraints).toEqual(
      expect.arrayContaining([
        'donation_paid_fields',
        'donation_amount_positive',
        'donation_anonymous_has_no_public_name',
        'donation_region_source_consistency',
        'donation_contact_phone_e164',
        'region_hierarchy',
        'campaign_goal_positive',
      ]),
    );
  });

  test('уникальные индексы идемпотентности и справочника на месте', async () => {
    // Act
    const rows = await prisma.$queryRawUnsafe<{ indexname: string }[]>(
      "SELECT indexname FROM pg_indexes WHERE schemaname = 'public'",
    );
    const indexes = rows.map((row) => row.indexname);

    // Assert
    expect(indexes).toEqual(
      expect.arrayContaining([
        'payment_event_provider_provider_event_id_key',
        'region_one_row_per_country',
        'donation_status_paid_at_id_idx',
        // По этому номеру обработчик вебхука находит донат: без уникальности
        // колбэк применится к случайному из двух.
        'donation_invoice_no_key',
      ]),
    );
  });

  test('номер счёта выдаёт последовательность и не даёт выйти за int4', async () => {
    // Act
    const sequences = await prisma.$queryRawUnsafe<{ max_value: bigint; cycle: boolean }[]>(
      `SELECT max_value, cycle
         FROM pg_sequences
        WHERE schemaname = 'public' AND sequencename = 'donation_invoice_no_seq'`,
    );

    // Assert: NO CYCLE обязателен — второй круг означает два доната с одним
    // InvId, то есть колбэк, применённый не к тому платежу.
    expect(sequences).toHaveLength(1);
    expect(sequences[0]).toMatchObject({ max_value: 2_147_483_647n, cycle: false });
  });

  test('каждый донат получает свой номер счёта, не спрашивая сервис', async () => {
    // Arrange & Act: сервис номер не назначает — его выдаёт база
    const first = await createPendingDonation(prisma, fixtures);
    const second = await createPendingDonation(prisma, fixtures);

    const numbers = await prisma.donation.findMany({
      where: { id: { in: [first.id, second.id] } },
      select: { invoiceNo: true },
    });

    // Assert
    const issued = numbers.map(({ invoiceNo }) => invoiceNo);

    expect(issued).toHaveLength(2);
    expect(new Set(issued).size).toBe(2);
    for (const invoiceNo of issued) {
      expect(invoiceNo).toBeGreaterThan(0);
    }
  });

  test('все денежные колонки — bigint: копейки целым числом, без плавающей точки', async () => {
    // Act
    const columns = await prisma.$queryRawUnsafe<
      { table_name: string; column_name: string; data_type: string }[]
    >(
      `SELECT table_name, column_name, data_type
         FROM information_schema.columns
        WHERE table_schema = 'public'
          AND (column_name LIKE '%kopecks%' OR column_name LIKE '%amount%')`,
    );

    // Assert
    expect(columns.length).toBeGreaterThan(0);

    for (const column of columns) {
      expect(column.data_type).toBe('bigint');
    }
  });

  test('периоды цели месяца не пересекаются', async () => {
    // Act: второй период, залезающий в сентябрьский
    const act = prisma.campaignMonthlyGoal.create({
      data: {
        campaignId: fixtures.campaignId,
        periodStart: new Date(Date.UTC(2026, 8, 20)),
        periodEnd: new Date(Date.UTC(2026, 9, 20)),
        goalKopecks: TEST_MONTHLY_GOAL_KOPECKS,
      },
    });

    // Assert
    await expect(act).rejects.toThrow(/campaign_monthly_goal_no_overlap/);
  });

  test('следующий месяц добавляется без конфликта', async () => {
    // Act
    const next = await prisma.campaignMonthlyGoal.create({
      data: {
        campaignId: fixtures.campaignId,
        periodStart: new Date(Date.UTC(2026, 9, 1)),
        periodEnd: new Date(Date.UTC(2026, 9, 31)),
        goalKopecks: TEST_MONTHLY_GOAL_KOPECKS,
      },
      select: { id: true },
    });

    // Assert
    expect(next.id).toHaveLength(36);
    const periods = await prisma.campaignMonthlyGoal.count({
      where: { campaignId: fixtures.campaignId },
    });
    expect(periods).toBe(2);
  });

  test('субъект без страны-родителя не записывается', async () => {
    // Act
    const act = prisma.$executeRawUnsafe(
      `INSERT INTO "region" ("type", "country_code", "code", "slug", "name")
       VALUES ('subject', 'RU', '77', 'sirota', 'Регион без страны')`,
    );

    // Assert
    await expect(act).rejects.toThrow(/region_hierarchy/);
  });

  test('вторая строка той же страны не записывается', async () => {
    // Act
    const act = prisma.region.create({
      data: { type: 'country', countryCode: 'KZ', slug: 'kz-2', name: 'Казахстан (дубль)' },
    });

    // Assert
    await expect(act).rejects.toThrow(/region_one_row_per_country/);
  });

  test('тестовый период цели месяца совпадает с сентябрём 2026', () => {
    // Assert: фикстуры и триггер должны говорить об одном и том же месяце
    expect(TEST_MONTH_START.toISOString()).toBe('2026-09-01T00:00:00.000Z');
    expect(TEST_MONTH_END.toISOString()).toBe('2026-09-30T00:00:00.000Z');
  });
});
