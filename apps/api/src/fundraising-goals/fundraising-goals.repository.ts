import { Injectable } from '@nestjs/common';

import { pageArgs } from '../common/pagination';
import type { PageQueryDto } from '../common/pagination';
import { PrismaService } from '../database/prisma.service';
import type { Prisma } from '../generated/prisma/client';
import { FundraisingGoalStatus } from '../generated/prisma/enums';
import type { GoalRow } from './dto/goal-response.dto';

export const GOAL_SELECT = {
  id: true,
  title: true,
  description: true,
  status: true,
  targetAmountKopecks: true,
  manualAdjustmentKopecks: true,
  startsAt: true,
  endsAt: true,
  completedAt: true,
  createdAt: true,
  updatedAt: true,
  createdBy: { select: { email: true } },
  updatedBy: { select: { email: true } },
} as const satisfies Prisma.FundraisingGoalSelect;

type Db = PrismaService | Prisma.TransactionClient;

/**
 * Доступ к таблице `fundraising_goal`. Сервис решает, что можно делать
 * с этапом; здесь только как это записать и прочитать.
 */
@Injectable()
export class FundraisingGoalsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findActive(db: Db = this.prisma): Promise<GoalRow | null> {
    return db.fundraisingGoal.findFirst({ where: { status: FundraisingGoalStatus.ACTIVE }, select: GOAL_SELECT });
  }

  findById(id: string, db: Db = this.prisma): Promise<GoalRow | null> {
    return db.fundraisingGoal.findUnique({ where: { id }, select: GOAL_SELECT });
  }

  /**
   * Строка этапа под блокировкой до конца транзакции: две правки одного
   * этапа (активация и архив из двух вкладок) выстраиваются в очередь.
   */
  async lockById(id: string, tx: Prisma.TransactionClient): Promise<GoalRow | null> {
    const locked = await tx.$queryRaw<{ id: string }[]>`
      SELECT "id"::text AS "id" FROM "fundraising_goal" WHERE "id" = ${id}::uuid FOR UPDATE`;

    return locked.length === 0 ? null : this.findById(id, tx);
  }

  /** Страница списка: активный первым (порядок значений enum), дальше новые сверху. */
  async page(query: PageQueryDto & { readonly status?: FundraisingGoalStatus }): Promise<{ rows: GoalRow[]; total: number }> {
    const where: Prisma.FundraisingGoalWhereInput = query.status === undefined ? {} : { status: query.status };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.fundraisingGoal.findMany({
        where,
        select: GOAL_SELECT,
        orderBy: [{ status: 'asc' }, { createdAt: 'desc' }, { id: 'desc' }],
        ...pageArgs(query),
      }),
      this.prisma.fundraisingGoal.count({ where }),
    ]);

    return { rows, total };
  }

  create(data: Prisma.FundraisingGoalUncheckedCreateInput, db: Db = this.prisma): Promise<GoalRow> {
    return db.fundraisingGoal.create({ data, select: GOAL_SELECT });
  }

  update(id: string, data: Prisma.FundraisingGoalUncheckedUpdateInput, db: Db = this.prisma): Promise<GoalRow> {
    return db.fundraisingGoal.update({ where: { id }, data, select: GOAL_SELECT });
  }

  /**
   * Завершить текущий активный этап, кроме `exceptId`. Условие `status = ACTIVE`
   * перепроверяется после ожидания блокировки (READ COMMITTED): если параллельная
   * транзакция уже сменила активный этап, здесь обновится 0 строк, а вставка
   * второго ACTIVE упрётся в уникальный индекс.
   */
  async completeActive(exceptId: string, actorId: string | null, tx: Prisma.TransactionClient): Promise<GoalRow | null> {
    const current = await tx.fundraisingGoal.findFirst({
      where: { status: FundraisingGoalStatus.ACTIVE, id: { not: exceptId } },
      select: { id: true },
    });

    if (current === null) {
      return null;
    }

    const { count } = await tx.fundraisingGoal.updateMany({
      where: { id: current.id, status: FundraisingGoalStatus.ACTIVE },
      data: { status: FundraisingGoalStatus.COMPLETED, completedAt: new Date(), updatedById: actorId },
    });

    return count === 0 ? null : this.findById(current.id, tx);
  }
}
