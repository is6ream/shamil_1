import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import { Logger } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from '../../generated/prisma/client';
import { RegionType } from '../../generated/prisma/enums';
import {
  CAMPAIGN_SEED,
  MONTHLY_GOAL_PLACEHOLDER_KOPECKS,
  currentMonthPeriod,
} from './campaign.data';
import {
  DEFAULT_SORT_ORDER,
  HOME_SUBJECT_CODE,
  HOME_SUBJECT_SORT_ORDER,
  RU_SUBJECTS,
  SEED_COUNTRIES,
} from './regions.data';

/**
 * Справочные данные: сбор, цель месяца, страны и субъекты РФ.
 *
 * Запуск в разработке:  npm run db:seed --workspace @shamil/api
 * Запуск на проде:      node dist/database/seed/index.js
 *
 * Сиды идемпотентны — их можно запускать на боевой базе повторно. Ничего,
 * что могли поправить руками (цель месяца, минимальный донат, флаги регионов),
 * повторный запуск не перетирает. Донатов и фотографий сиды не создают:
 * в публичном сборе не должно быть придуманных цифр.
 */
const logger = new Logger('seed');

const RUSSIA_COUNTRY_CODE = 'RU';

function loadRootEnvFile(): void {
  const envFile = resolve(__dirname, '../../../../../.env');

  if (existsSync(envFile)) {
    process.loadEnvFile(envFile);
  }
}

async function seedRegions(prisma: PrismaClient): Promise<number> {
  for (const country of SEED_COUNTRIES) {
    await prisma.region.upsert({
      where: { slug: country.slug },
      create: {
        type: RegionType.country,
        countryCode: country.countryCode,
        slug: country.slug,
        name: country.name,
        sortOrder: country.sortOrder,
        isRanked: country.isRanked,
      },
      // Флаги и порядок сортировки могли поправить руками — не трогаем,
      // обновляем только название из справочника.
      update: { name: country.name },
    });
  }

  const russia = await prisma.region.findFirstOrThrow({
    where: { type: RegionType.country, countryCode: RUSSIA_COUNTRY_CODE },
    select: { id: true },
  });

  for (const [code, name] of RU_SUBJECTS) {
    await prisma.region.upsert({
      where: { slug: code },
      create: {
        type: RegionType.subject,
        parentId: russia.id,
        countryCode: RUSSIA_COUNTRY_CODE,
        code,
        slug: code,
        name,
        sortOrder: code === HOME_SUBJECT_CODE ? HOME_SUBJECT_SORT_ORDER : DEFAULT_SORT_ORDER,
      },
      update: { name },
    });
  }

  return SEED_COUNTRIES.length + RU_SUBJECTS.length;
}

async function seedCampaign(prisma: PrismaClient): Promise<void> {
  const campaign = await prisma.campaign.upsert({
    where: { slug: CAMPAIGN_SEED.slug },
    create: {
      slug: CAMPAIGN_SEED.slug,
      title: CAMPAIGN_SEED.title,
      goalKopecks: CAMPAIGN_SEED.goalKopecks,
      currency: CAMPAIGN_SEED.currency,
      minDonationKopecks: CAMPAIGN_SEED.minDonationKopecks,
    },
    // Цель и название приходят из ТЗ, их обновляем. Минимальный донат могли
    // изменить через админку — оставляем как есть.
    update: {
      title: CAMPAIGN_SEED.title,
      goalKopecks: CAMPAIGN_SEED.goalKopecks,
      currency: CAMPAIGN_SEED.currency,
    },
    select: { id: true },
  });

  const period = currentMonthPeriod();

  await prisma.campaignMonthlyGoal.upsert({
    where: {
      campaignId_periodStart: { campaignId: campaign.id, periodStart: period.start },
    },
    create: {
      campaignId: campaign.id,
      periodStart: period.start,
      periodEnd: period.end,
      goalKopecks: MONTHLY_GOAL_PLACEHOLDER_KOPECKS,
    },
    // Пусто намеренно: если цель месяца уже стоит, она настоящая — из админки.
    update: {},
  });
}

async function main(): Promise<void> {
  loadRootEnvFile();

  const connectionString = process.env.DATABASE_URL;

  if (connectionString === undefined || connectionString.length === 0) {
    throw new Error('DATABASE_URL не задан: сиды не знают, в какую базу писать');
  }

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
    log: ['warn', 'error'],
  });

  try {
    const regionsCount = await seedRegions(prisma);
    await seedCampaign(prisma);

    const period = currentMonthPeriod();
    const monthlyGoalRubles = Number(MONTHLY_GOAL_PLACEHOLDER_KOPECKS / 100n);

    logger.log(`Регионы: ${regionsCount} (страны + субъекты РФ)`);
    logger.log(`Сбор «${CAMPAIGN_SEED.title}»: цель 240 000 000 ₽`);
    logger.warn(
      `Цель месяца — ЗАГЛУШКА ${monthlyGoalRubles.toLocaleString('ru-RU')} ₽ ` +
        `на ${period.start.toISOString().slice(0, 10)}…${period.end.toISOString().slice(0, 10)}. ` +
        'Нужна цифра от заказчика.',
    );
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((error: unknown) => {
  logger.error('Сиды не применились', error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
});
