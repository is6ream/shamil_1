import { Logger } from '@nestjs/common';

import type { PrismaClient } from '../../generated/prisma/client';
import { ABOUT_SEED, CONTACTS_SEED, FAQ_SEED, HERO_SEED, REQUISITES_SEED, STAGES_SEED } from './content.data';

const logger = new Logger('seed:content');

const SORT_STEP = 10;

export interface ContentSeedResult {
  readonly blocksCreated: number;
  readonly stagesCreated: number;
}

/**
 * Стартовый контент. Идемпотентно и бережно: блок, который уже есть, не
 * перетирается (его могли поправить в админке); этапы создаются, только если
 * таблица пуста.
 */
export async function seedContent(prisma: PrismaClient): Promise<ContentSeedResult> {
  const blocks = await prisma.contentBlock.createMany({
    data: [
      { key: 'hero', data: { ...HERO_SEED, trust: [...HERO_SEED.trust] } },
      { key: 'about', data: { ...ABOUT_SEED, facts: ABOUT_SEED.facts.map((fact) => ({ ...fact })) } },
      { key: 'requisites', data: { ...REQUISITES_SEED } },
      { key: 'contacts', data: { ...CONTACTS_SEED } },
      { key: 'faq', data: { items: [...FAQ_SEED.items] } },
    ],
    skipDuplicates: true,
  });

  let stagesCreated = 0;

  if ((await prisma.constructionStage.count()) === 0) {
    const created = await prisma.constructionStage.createMany({
      data: STAGES_SEED.map((stage, index) => ({
        title: stage.title,
        status: stage.status,
        budgetKopecks: stage.budgetKopecks,
        sortOrder: (index + 1) * SORT_STEP,
      })),
    });

    stagesCreated = created.count;
  }

  logger.log(`Контент: блоков создано ${blocks.count}, этапов создано ${stagesCreated}`);

  return { blocksCreated: blocks.count, stagesCreated };
}
