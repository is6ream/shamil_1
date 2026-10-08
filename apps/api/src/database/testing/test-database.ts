import { ConfigService } from '@nestjs/config';
import { hash } from 'bcryptjs';
import { PrismaPg } from '@prisma/adapter-pg';

import { BCRYPT_COST } from '../../auth/auth.constants';
import type { AppConfig } from '../../config/configuration';
import { PrismaClient } from '../../generated/prisma/client';
import { AdminRole, DonationStatus, RegionType } from '../../generated/prisma/enums';
import { PrismaService } from '../prisma.service';
import { DB_TESTS_ENV_FLAG } from './global-setup';

/**
 * Подключение и фикстуры для тестов схемы. Работает с реальным PostgreSQL:
 * проверяются триггеры и ограничения, а их мок не воспроизводит.
 */

/** `describe`, который сам выключается, если тестовая база не поднята. */
export const describeDatabase = process.env[DB_TESTS_ENV_FLAG] === '1' ? describe : describe.skip;

/** 15 сентября 2026, 12:00 МСК — внутри тестового периода цели месяца. */
export const TEST_PAID_AT = new Date('2026-09-15T09:00:00.000Z');
export const TEST_MONTH_START = new Date(Date.UTC(2026, 8, 1));
export const TEST_MONTH_END = new Date(Date.UTC(2026, 8, 30));

/** 500 000 ₽ — цель месяца в тестах. */
export const TEST_MONTHLY_GOAL_KOPECKS = 50_000_000n;
/** 100 ₽ — минимальный донат по ТЗ, он же слоган. */
export const TEST_DONATION_KOPECKS = 10_000n;

export interface TestFixtures {
  readonly campaignId: string;
  readonly russiaId: string;
  readonly bashkortostanId: string;
  readonly kazakhstanId: string;
}

export function createTestClient(): PrismaClient {
  const connectionString = process.env.TEST_DATABASE_URL;

  if (connectionString === undefined || connectionString.length === 0) {
    throw new Error('TEST_DATABASE_URL не задан');
  }

  return new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
    log: ['warn', 'error'],
  });
}

/** Клиент в обёртке приложения — для тестов сервисов, которые ждут `PrismaService`. */
export function createTestPrismaService(): PrismaService {
  const url = process.env.TEST_DATABASE_URL;

  if (url === undefined || url.length === 0) {
    throw new Error('TEST_DATABASE_URL не задан');
  }

  return new PrismaService(new ConfigService<AppConfig, true>({ database: { url } }));
}

/**
 * TRUNCATE, а не DELETE: удалять оплаченные донаты запрещено триггером,
 * а TRUNCATE построчные триггеры не вызывает — как раз то, что нужно тестам.
 */
export async function resetDatabase(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${TRUNCATED_TABLES.map((name) => `"${name}"`).join(', ')} CASCADE`);
}

/**
 * Все таблицы приложения. Новая таблица обязана попасть сюда — иначе тесты
 * начнут видеть данные друг друга. `_prisma_migrations` не трогаем.
 */
const TRUNCATED_TABLES = [
  'payment_event',
  'donation_contact',
  'donation',
  'gallery_item',
  'campaign_monthly_goal',
  'campaign_stats',
  'region_stats',
  'campaign',
  'region',
  'admin_refresh_token',
  'admin_user',
  'audit_log',
] as const;

/**
 * Хеш пароля `TEST_ADMIN_PASSWORD`, посчитанный один раз на процесс:
 * bcrypt с cost 12 — это сотни миллисекунд на каждый вызов.
 */
let testPasswordHash: Promise<string> | undefined;

export const TEST_ADMIN_PASSWORD = 'correct-horse-battery';

export interface TestAdminOptions {
  readonly email?: string;
  readonly role?: AdminRole;
  readonly isActive?: boolean;
}

export async function createTestAdmin(
  prisma: PrismaClient,
  options: TestAdminOptions = {},
): Promise<{ id: string; email: string; role: AdminRole }> {
  testPasswordHash ??= hash(TEST_ADMIN_PASSWORD, BCRYPT_COST);

  return prisma.adminUser.create({
    data: {
      email: options.email ?? 'admin@example.test',
      passwordHash: await testPasswordHash,
      role: options.role ?? AdminRole.SUPER_ADMIN,
      isActive: options.isActive ?? true,
    },
    select: { id: true, email: true, role: true },
  });
}

export interface SeedFixturesOptions {
  /**
   * Слаг сбора. Витрина и создание доната ищут сбор по `CAMPAIGN_SLUG`,
   * поэтому их тесты передают его сюда; тестам схемы слаг безразличен.
   */
  readonly campaignSlug?: string;
}

export async function seedFixtures(
  prisma: PrismaClient,
  options: SeedFixturesOptions = {},
): Promise<TestFixtures> {
  const campaign = await prisma.campaign.create({
    data: {
      slug: options.campaignSlug ?? 'shamil-test',
      title: 'Мечеть «Шамиль» (тест)',
      goalKopecks: 24_000_000_000n,
      monthlyGoals: {
        create: {
          periodStart: TEST_MONTH_START,
          periodEnd: TEST_MONTH_END,
          goalKopecks: TEST_MONTHLY_GOAL_KOPECKS,
        },
      },
    },
    select: { id: true },
  });

  const russia = await prisma.region.create({
    data: { type: RegionType.country, countryCode: 'RU', slug: 'ru', name: 'Россия', isRanked: false },
    select: { id: true },
  });

  const bashkortostan = await prisma.region.create({
    data: {
      type: RegionType.subject,
      parentId: russia.id,
      countryCode: 'RU',
      code: '02',
      slug: '02',
      name: 'Республика Башкортостан',
    },
    select: { id: true },
  });

  const kazakhstan = await prisma.region.create({
    data: { type: RegionType.country, countryCode: 'KZ', slug: 'kz', name: 'Казахстан' },
    select: { id: true },
  });

  return {
    campaignId: campaign.id,
    russiaId: russia.id,
    bashkortostanId: bashkortostan.id,
    kazakhstanId: kazakhstan.id,
  };
}

export interface PendingDonationOptions {
  readonly regionId?: string;
  readonly amountKopecks?: bigint;
  readonly provider?: string;
  readonly providerPaymentId?: string;
}

/** `invoiceNo` возвращается вместе с id: по нему донат находит вебхук. */
export async function createPendingDonation(
  prisma: PrismaClient,
  fixtures: TestFixtures,
  options: PendingDonationOptions = {},
): Promise<{ id: string; invoiceNo: number }> {
  return prisma.donation.create({
    data: {
      campaignId: fixtures.campaignId,
      regionId: options.regionId,
      // Регион и источник атрибуции записываются только вместе — это CHECK.
      regionSource: options.regionId === undefined ? undefined : 'form',
      amountKopecks: options.amountKopecks ?? TEST_DONATION_KOPECKS,
      provider: options.provider ?? 'manual',
      providerPaymentId: options.providerPaymentId,
    },
    select: { id: true, invoiceNo: true },
  });
}

/** Перевод в paid так, как это сделает обработчик вебхука: сумма — из колбэка. */
export async function markPaid(
  prisma: PrismaClient,
  donationId: string,
  paidAmountKopecks: bigint,
  paidAt: Date = TEST_PAID_AT,
): Promise<void> {
  await prisma.donation.update({
    where: { id: donationId },
    data: { status: DonationStatus.paid, paidAmountKopecks, paidAt },
  });
}
