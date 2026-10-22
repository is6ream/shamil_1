import type { FundraisingGoalStatus } from '../../generated/prisma/enums';
import type { GoalProgress } from '../goal-progress.calculator';

/**
 * Активный этап для главной. Деньги — копейки строкой, как во всём API
 * (BigInt в JSON не сериализуется). Персональных данных здесь нет и быть
 * не может: в этап не попадает ни один атрибут доната, только сумма.
 */
export interface PublicActiveGoalResponse {
  readonly id: string;
  readonly title: string;
  readonly description: string | null;
  readonly targetAmountKopecks: string;
  readonly collectedAmountKopecks: string;
  readonly percent: number;
  readonly isReached: boolean;
}

export interface GoalAdminResponse {
  readonly id: string;
  readonly title: string;
  readonly description: string | null;
  readonly status: FundraisingGoalStatus;
  readonly targetAmountKopecks: string;
  readonly manualAdjustmentKopecks: string;
  /** Оплаченные донаты за окно этапа — без корректировки. Подсказка админу. */
  readonly paidAmountKopecks: string;
  readonly collectedAmountKopecks: string;
  readonly percent: number;
  readonly isReached: boolean;
  readonly startsAt: string;
  readonly endsAt: string | null;
  readonly completedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly createdBy: string | null;
  readonly updatedBy: string | null;
}

/** Строка этапа в объёме, нужном ответам. */
export interface GoalRow {
  readonly id: string;
  readonly title: string;
  readonly description: string | null;
  readonly status: FundraisingGoalStatus;
  readonly targetAmountKopecks: bigint;
  readonly manualAdjustmentKopecks: bigint;
  readonly startsAt: Date;
  readonly endsAt: Date | null;
  readonly completedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly createdBy: { readonly email: string } | null;
  readonly updatedBy: { readonly email: string } | null;
}

export function toPublicGoal(row: GoalRow, progress: GoalProgress): PublicActiveGoalResponse {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    targetAmountKopecks: row.targetAmountKopecks.toString(),
    collectedAmountKopecks: progress.collectedKopecks.toString(),
    percent: progress.percent,
    isReached: progress.isReached,
  };
}

export function toAdminGoal(row: GoalRow, progress: GoalProgress): GoalAdminResponse {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    status: row.status,
    targetAmountKopecks: row.targetAmountKopecks.toString(),
    manualAdjustmentKopecks: row.manualAdjustmentKopecks.toString(),
    paidAmountKopecks: progress.paidKopecks.toString(),
    collectedAmountKopecks: progress.collectedKopecks.toString(),
    percent: progress.percent,
    isReached: progress.isReached,
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt?.toISOString() ?? null,
    completedAt: row.completedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    createdBy: row.createdBy?.email ?? null,
    updatedBy: row.updatedBy?.email ?? null,
  };
}
