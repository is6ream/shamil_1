import { Injectable } from '@nestjs/common';

import { PrismaService } from '../database/prisma.service';
import type { Prisma } from '../generated/prisma/client';

/** Прогресс этапа. Деньги — bigint копеек, процент — целый. */
export interface GoalProgress {
  /** Оплаченные донаты за окно этапа, без корректировки. */
  readonly paidKopecks: bigint;
  /** Итог: донаты + корректировка, не меньше нуля. Сверх цели — как есть. */
  readonly collectedKopecks: bigint;
  /** `min(100, floor(collected * 100 / target))`. */
  readonly percent: number;
  readonly isReached: boolean;
}

const HUNDRED = 100n;

/**
 * Прогресс по уже посчитанной сумме донатов. Чистая функция: вся арифметика
 * в bigint, без float — 100 млн ₽ в копейках уже за пределами точного `number`
 * при умножении на 100.
 */
export function computeGoalProgress(paidKopecks: bigint, adjustmentKopecks: bigint, targetKopecks: bigint): GoalProgress {
  const sum = paidKopecks + adjustmentKopecks;
  const collectedKopecks = sum > 0n ? sum : 0n;

  if (targetKopecks <= 0n) {
    return { paidKopecks, collectedKopecks, percent: 0, isReached: false };
  }

  const raw = (collectedKopecks * HUNDRED) / targetKopecks;

  return {
    paidKopecks,
    collectedKopecks,
    percent: Number(raw > HUNDRED ? HUNDRED : raw),
    isReached: collectedKopecks >= targetKopecks,
  };
}

type Db = PrismaService | Prisma.TransactionClient;

/**
 * «Собрано» по этапам сбора.
 *
 * Считается от статуса доната, а не от провайдера: ручное поступление,
 * подтверждённый перевод и колбэк Robokassa одинаково дают `paid`, и после
 * подключения агрегатора здесь ничего не меняется. `pending` и `failed`
 * не учитываются; отдельного статуса возврата в схеме нет.
 *
 * Сумма — `paid_amount_kopecks` (то, что подтвердил провайдер или бухгалтер),
 * как у триггера витрин. Окно — [starts_at; ends_at] включительно.
 *
 * Один агрегирующий запрос на любой набор этапов: строки донатов в память
 * не выбираются. Индекс — существующий (status, paid_at DESC, id DESC).
 */
@Injectable()
export class GoalProgressCalculator {
  constructor(private readonly prisma: PrismaService) {}

  /** Суммы оплаченных донатов по id этапов. Неизвестный id в ответ не попадает. */
  async paidSums(goalIds: readonly string[], db: Db = this.prisma): Promise<ReadonlyMap<string, bigint>> {
    if (goalIds.length === 0) {
      return new Map();
    }

    const rows = await db.$queryRaw<{ id: string; total: bigint }[]>`
      SELECT g."id"::text AS "id",
             COALESCE(SUM(d."paid_amount_kopecks"), 0)::bigint AS "total"
        FROM "fundraising_goal" g
        LEFT JOIN "donation" d
          ON d."campaign_id" = g."campaign_id"
         AND d."status" = 'paid'
         AND d."paid_at" >= g."starts_at"
         AND (g."ends_at" IS NULL OR d."paid_at" <= g."ends_at")
       WHERE g."id" = ANY(${[...goalIds]}::uuid[])
       GROUP BY g."id"`;

    return new Map(rows.map((row) => [row.id, row.total]));
  }

  /** Прогресс одного этапа: одна строка того же запроса. */
  async progressOf(
    goal: { readonly id: string; readonly targetAmountKopecks: bigint; readonly manualAdjustmentKopecks: bigint },
    db: Db = this.prisma,
  ): Promise<GoalProgress> {
    const sums = await this.paidSums([goal.id], db);

    return computeGoalProgress(sums.get(goal.id) ?? 0n, goal.manualAdjustmentKopecks, goal.targetAmountKopecks);
  }
}
