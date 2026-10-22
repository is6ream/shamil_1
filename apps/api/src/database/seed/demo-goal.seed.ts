import type { PrismaClient } from '../../generated/prisma/client';
import { FundraisingGoalStatus } from '../../generated/prisma/enums';
import { CAMPAIGN_SEED } from './campaign.data';

/**
 * Демо-этап «На кирпичи — 700 000 ₽» — ТОЛЬКО для локальной разработки.
 *
 * Сиды запускаются и на проде (`RUN_SEED=true` в Dockerfile), а придуманный
 * этап на боевой главной — это придуманная цифра в публичном сборе. Поэтому
 * условие — явное `NODE_ENV=development`, а не «не production»: пустой или
 * неизвестный NODE_ENV тоже ничего не создаёт.
 */
export const DEMO_GOAL = {
  title: 'На кирпичи',
  description: 'Кладка стен первого этажа',
  targetAmountKopecks: 70_000_000n,
  /** Демонстрационная корректировка, чтобы полоса не стояла на нуле. */
  manualAdjustmentKopecks: 24_500_000n,
} as const;

export type DemoGoalResult = 'created' | 'skipped-env' | 'skipped-exists';

export function isDemoGoalAllowed(env: NodeJS.ProcessEnv): boolean {
  return env.NODE_ENV === 'development';
}

/** Создаёт активный демо-этап, только если этапов ещё нет вовсе. */
export async function seedDemoGoal(prisma: PrismaClient, env: NodeJS.ProcessEnv): Promise<DemoGoalResult> {
  if (!isDemoGoalAllowed(env)) {
    return 'skipped-env';
  }

  if ((await prisma.fundraisingGoal.count()) > 0) {
    return 'skipped-exists';
  }

  const campaign = await prisma.campaign.findUniqueOrThrow({ where: { slug: CAMPAIGN_SEED.slug }, select: { id: true } });

  await prisma.fundraisingGoal.create({
    data: {
      campaignId: campaign.id,
      title: DEMO_GOAL.title,
      description: DEMO_GOAL.description,
      targetAmountKopecks: DEMO_GOAL.targetAmountKopecks,
      manualAdjustmentKopecks: DEMO_GOAL.manualAdjustmentKopecks,
      startsAt: new Date(),
      status: FundraisingGoalStatus.ACTIVE,
    },
  });

  return 'created';
}
