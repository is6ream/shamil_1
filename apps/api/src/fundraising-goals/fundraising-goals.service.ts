import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';

import { AuditService } from '../audit/audit.service';
import { userActor } from '../audit/audit.types';
import type { AdminPrincipal, RequestMeta } from '../auth/auth.types';
import type { Page } from '../common/pagination';
import { PrismaService } from '../database/prisma.service';
import { isUniqueViolation } from '../database/prisma-errors';
import { CAMPAIGN_SLUG } from '../database/seed/campaign.data';
import type { Prisma } from '../generated/prisma/client';
import { FundraisingGoalStatus } from '../generated/prisma/enums';
import { RevalidationService } from '../revalidation/revalidation.service';
import { ActiveGoalService } from './active-goal.service';
import type { CreateGoalDto, GoalListQueryDto, UpdateGoalDto } from './dto/goal.dto';
import { toAdminGoal } from './dto/goal-response.dto';
import type { GoalAdminResponse, GoalRow } from './dto/goal-response.dto';
import {
  ACTIVE_GOAL_REVALIDATE_TAG,
  GOAL_ADJUSTMENT_MAX_ABS_KOPECKS,
  GOAL_TARGET_MAX_KOPECKS,
  GOAL_TARGET_MIN_KOPECKS,
} from './fundraising-goals.constants';
import { FundraisingGoalsRepository } from './fundraising-goals.repository';
import { GoalProgressCalculator, computeGoalProgress } from './goal-progress.calculator';

const ACTIVE_CONFLICT_MESSAGE = 'Другой этап только что сделали активным — обновите список и повторите';

/** Какие переходы разрешены. В DRAFT не возвращаются, из ARCHIVED не выходят (триггер БД — то же). */
const TRANSITIONS: Readonly<Record<'activate' | 'complete' | 'archive', readonly FundraisingGoalStatus[]>> = {
  activate: [FundraisingGoalStatus.DRAFT, FundraisingGoalStatus.COMPLETED],
  complete: [FundraisingGoalStatus.ACTIVE],
  archive: [FundraisingGoalStatus.DRAFT, FundraisingGoalStatus.ACTIVE, FundraisingGoalStatus.COMPLETED],
};

function parseTarget(value: string): bigint {
  const kopecks = BigInt(value);

  if (kopecks < GOAL_TARGET_MIN_KOPECKS || kopecks > GOAL_TARGET_MAX_KOPECKS) {
    throw new BadRequestException('Цель этапа — от 1 000 ₽ до 100 000 000 ₽');
  }

  return kopecks;
}

function parseAdjustment(value: string): bigint {
  const kopecks = BigInt(value);
  const absolute = kopecks < 0n ? -kopecks : kopecks;

  if (absolute > GOAL_ADJUSTMENT_MAX_ABS_KOPECKS) {
    throw new BadRequestException('Корректировка — не больше 100 000 000 ₽ по модулю');
  }

  return kopecks;
}

function assertPeriod(startsAt: Date, endsAt: Date | null): void {
  if (endsAt !== null && endsAt <= startsAt) {
    throw new BadRequestException('Окончание этапа должно быть позже начала');
  }
}

/** Снимок для журнала: деньги строкой, без связей. */
function auditSnapshot(row: GoalRow): Record<string, unknown> {
  return {
    title: row.title,
    description: row.description,
    status: row.status,
    targetAmountKopecks: row.targetAmountKopecks.toString(),
    manualAdjustmentKopecks: row.manualAdjustmentKopecks.toString(),
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt?.toISOString() ?? null,
  };
}

/**
 * Этапы сбора в админке. Каждая правка — в журнал, сброс кеша публичного
 * эндпоинта и ревалидация тега сайта `active-goal`. Ревалидация не ждётся
 * и не откатывает сохранение: сбой сайта только логируется (`RevalidationService`).
 */
@Injectable()
export class FundraisingGoalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly goals: FundraisingGoalsRepository,
    private readonly calculator: GoalProgressCalculator,
    private readonly activeGoal: ActiveGoalService,
    private readonly audit: AuditService,
    private readonly revalidation: RevalidationService,
  ) {}

  async list(query: GoalListQueryDto): Promise<Page<GoalAdminResponse>> {
    const { rows, total } = await this.goals.page(query);
    const sums = await this.calculator.paidSums(rows.map((row) => row.id));

    return {
      items: rows.map((row) =>
        toAdminGoal(row, computeGoalProgress(sums.get(row.id) ?? 0n, row.manualAdjustmentKopecks, row.targetAmountKopecks)),
      ),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async get(id: string): Promise<GoalAdminResponse> {
    const row = await this.goals.findById(id);

    if (row === null) {
      throw new NotFoundException('Этап сбора не найден');
    }

    return this.withProgress(row);
  }

  async create(dto: CreateGoalDto, actor: AdminPrincipal, meta: RequestMeta): Promise<GoalAdminResponse> {
    const startsAt = dto.startsAt === undefined ? new Date() : new Date(dto.startsAt);
    const endsAt = dto.endsAt === undefined || dto.endsAt === null ? null : new Date(dto.endsAt);

    assertPeriod(startsAt, endsAt);

    const data = {
      title: dto.title,
      description: dto.description ?? null,
      targetAmountKopecks: parseTarget(dto.targetAmountKopecks),
      manualAdjustmentKopecks: dto.manualAdjustmentKopecks === undefined ? 0n : parseAdjustment(dto.manualAdjustmentKopecks),
      startsAt,
      endsAt,
    };

    const created = await this.prisma.$transaction(async (tx) => {
      const campaign = await tx.campaign.findUnique({ where: { slug: CAMPAIGN_SLUG }, select: { id: true } });

      if (campaign === null) {
        throw new NotFoundException('Сбор не найден — запустите сиды');
      }

      const row = await this.goals.create(
        { ...data, campaignId: campaign.id, status: FundraisingGoalStatus.DRAFT, createdById: actor.id, updatedById: actor.id },
        tx,
      );

      await this.record(tx, actor, meta, 'fundraising_goal.create', row.id, undefined, auditSnapshot(row));

      return row;
    });

    // Черновик на сайте не виден — ревалидировать нечего.
    return this.withProgress(created);
  }

  async update(id: string, dto: UpdateGoalDto, actor: AdminPrincipal, meta: RequestMeta): Promise<GoalAdminResponse> {
    const updated = await this.prisma.$transaction(async (tx) => {
      const before = await this.lockOrThrow(id, tx);

      if (before.status === FundraisingGoalStatus.ARCHIVED) {
        throw new ConflictException('Этап в архиве — его нельзя менять');
      }

      const startsAt = dto.startsAt === undefined ? before.startsAt : new Date(dto.startsAt);
      const endsAt = dto.endsAt === undefined ? before.endsAt : dto.endsAt === null ? null : new Date(dto.endsAt);

      assertPeriod(startsAt, endsAt);

      const row = await this.goals.update(
        id,
        {
          ...(dto.title === undefined ? {} : { title: dto.title }),
          ...(dto.description === undefined ? {} : { description: dto.description }),
          ...(dto.targetAmountKopecks === undefined ? {} : { targetAmountKopecks: parseTarget(dto.targetAmountKopecks) }),
          ...(dto.manualAdjustmentKopecks === undefined
            ? {}
            : { manualAdjustmentKopecks: parseAdjustment(dto.manualAdjustmentKopecks) }),
          startsAt,
          endsAt,
          updatedById: actor.id,
        },
        tx,
      );

      await this.record(tx, actor, meta, 'fundraising_goal.update', id, auditSnapshot(before), auditSnapshot(row));

      return row;
    });

    this.afterChange(updated.status === FundraisingGoalStatus.ACTIVE);

    return this.withProgress(updated);
  }

  /**
   * Сделать этап активным. Текущий активный завершается в той же транзакции.
   * Параллельная активация другого этапа упирается в частичный уникальный
   * индекс `fundraising_goal_single_active` и получает 409.
   */
  async activate(id: string, actor: AdminPrincipal, meta: RequestMeta): Promise<GoalAdminResponse> {
    const activated = await this.withActiveConflict(() =>
      this.prisma.$transaction(async (tx) => {
        const before = await this.lockOrThrow(id, tx);

        if (before.status === FundraisingGoalStatus.ACTIVE) {
          return before;
        }

        this.assertTransition('activate', before);

        const completed = await this.goals.completeActive(id, actor.id, tx);

        if (completed !== null) {
          await this.record(tx, actor, meta, 'fundraising_goal.complete', completed.id, { status: FundraisingGoalStatus.ACTIVE }, {
            status: completed.status,
            reason: `активирован этап ${id}`,
          });
        }

        const row = await this.goals.update(
          id,
          { status: FundraisingGoalStatus.ACTIVE, completedAt: null, updatedById: actor.id },
          tx,
        );

        await this.record(tx, actor, meta, 'fundraising_goal.activate', id, { status: before.status }, { status: row.status });

        return row;
      }),
    );

    this.afterChange(true);

    return this.withProgress(activated);
  }

  async complete(id: string, actor: AdminPrincipal, meta: RequestMeta): Promise<GoalAdminResponse> {
    return this.changeStatus(id, 'complete', FundraisingGoalStatus.COMPLETED, actor, meta);
  }

  async archive(id: string, actor: AdminPrincipal, meta: RequestMeta): Promise<GoalAdminResponse> {
    return this.changeStatus(id, 'archive', FundraisingGoalStatus.ARCHIVED, actor, meta);
  }

  private async changeStatus(
    id: string,
    transition: 'complete' | 'archive',
    status: FundraisingGoalStatus,
    actor: AdminPrincipal,
    meta: RequestMeta,
  ): Promise<GoalAdminResponse> {
    let wasActive = false;

    const row = await this.prisma.$transaction(async (tx) => {
      const before = await this.lockOrThrow(id, tx);

      this.assertTransition(transition, before);
      wasActive = before.status === FundraisingGoalStatus.ACTIVE;

      const updated = await this.goals.update(
        id,
        {
          status,
          ...(status === FundraisingGoalStatus.COMPLETED ? { completedAt: new Date() } : {}),
          updatedById: actor.id,
        },
        tx,
      );

      await this.record(tx, actor, meta, `fundraising_goal.${transition}`, id, { status: before.status }, { status });

      return updated;
    });

    this.afterChange(wasActive);

    return this.withProgress(row);
  }

  private assertTransition(transition: keyof typeof TRANSITIONS, goal: GoalRow): void {
    if (!TRANSITIONS[transition].includes(goal.status)) {
      throw new ConflictException(`Из статуса ${goal.status} это действие недоступно`);
    }
  }

  private async lockOrThrow(id: string, tx: Prisma.TransactionClient): Promise<GoalRow> {
    const row = await this.goals.lockById(id, tx);

    if (row === null) {
      throw new NotFoundException('Этап сбора не найден');
    }

    return row;
  }

  private async withProgress(row: GoalRow): Promise<GoalAdminResponse> {
    return toAdminGoal(row, await this.calculator.progressOf(row));
  }

  /**
   * Кеш публичного эндпоинта сбрасывается всегда — дешёво; сайт ревалидируется,
   * только если правка видна на главной (активный этап или его снятие).
   */
  private afterChange(isVisibleOnSite: boolean): void {
    this.activeGoal.invalidate();

    if (isVisibleOnSite) {
      void this.revalidation.notify([ACTIVE_GOAL_REVALIDATE_TAG]);
    }
  }

  private record(
    tx: Prisma.TransactionClient,
    actor: AdminPrincipal,
    meta: RequestMeta,
    action: string,
    entityId: string,
    before: unknown,
    after: unknown,
  ): Promise<void> {
    return this.audit.record(tx, {
      actor: userActor(actor),
      action,
      entityType: 'fundraising_goal',
      entityId,
      before,
      after,
      meta,
    });
  }

  private async withActiveConflict<T>(action: () => Promise<T>): Promise<T> {
    try {
      return await action();
    } catch (error: unknown) {
      if (isUniqueViolation(error) || isActiveIndexViolation(error)) {
        throw new ConflictException(ACTIVE_CONFLICT_MESSAGE);
      }

      throw error;
    }
  }
}

/**
 * 23505 по `fundraising_goal_single_active`. Под драйвер-адаптером Prisma
 * не всегда отдаёт P2002 для частичного индекса — ищем имя индекса в тексте.
 */
function isActiveIndexViolation(error: unknown): boolean {
  const text = typeof error === 'object' && error !== null && 'message' in error && typeof error.message === 'string'
    ? error.message
    : '';

  return text.includes('fundraising_goal_single_active') || text.includes('23505');
}
