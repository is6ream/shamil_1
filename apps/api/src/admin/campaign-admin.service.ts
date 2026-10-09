import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';

import { AuditService } from '../audit/audit.service';
import { userActor } from '../audit/audit.types';
import type { AdminPrincipal, RequestMeta } from '../auth/auth.types';
import { formatDateOnly, parseDateOnly } from '../common/dto-transforms';
import { PrismaService } from '../database/prisma.service';
import { isExclusionViolation } from '../database/prisma-errors';
import { CAMPAIGN_SLUG } from '../database/seed/campaign.data';
import type { Prisma } from '../generated/prisma/client';
import { RevalidationService } from '../revalidation/revalidation.service';
import type { CreateMonthlyGoalDto, UpdateCampaignDto, UpdateMonthlyGoalDto } from './dto/campaign.dto';

/** Потолок цели — 10 млрд ₽: граница против лишнего нуля, а не против амбиций. */
export const MAX_GOAL_KOPECKS = 1_000_000_000_000n;

export interface MonthlyGoalAdminResponse {
  readonly id: string;
  readonly periodStart: string;
  readonly periodEnd: string;
  readonly goalKopecks: string;
  readonly collectedKopecks: string;
}

export interface CampaignAdminResponse {
  readonly id: string;
  readonly slug: string;
  readonly title: string;
  readonly currency: string;
  readonly goalKopecks: string;
  readonly minDonationKopecks: string;
  readonly collectedKopecks: string;
  readonly donationsCount: number;
  readonly monthlyGoals: readonly MonthlyGoalAdminResponse[];
}

const GOAL_SELECT = {
  id: true,
  periodStart: true,
  periodEnd: true,
  goalKopecks: true,
  collectedKopecks: true,
} as const satisfies Prisma.CampaignMonthlyGoalSelect;

type GoalRow = Prisma.CampaignMonthlyGoalGetPayload<{ select: typeof GOAL_SELECT }>;

function toGoal(row: GoalRow): MonthlyGoalAdminResponse {
  return {
    id: row.id,
    periodStart: formatDateOnly(row.periodStart),
    periodEnd: formatDateOnly(row.periodEnd),
    goalKopecks: row.goalKopecks.toString(),
    collectedKopecks: row.collectedKopecks.toString(),
  };
}

function parseGoal(value: string): bigint {
  const kopecks = BigInt(value);

  if (kopecks > MAX_GOAL_KOPECKS) {
    throw new BadRequestException(`Цель не может превышать ${MAX_GOAL_KOPECKS / 100n} ₽`);
  }

  return kopecks;
}

function assertPeriod(start: Date, end: Date): void {
  if (end < start) {
    throw new BadRequestException('Конец периода раньше начала');
  }
}

/**
 * Цель сбора и цели месяца (D-06: SUPER_ADMIN, EDITOR). Каждая правка —
 * в журнал и ревалидация тега `campaign`: шкалы на главной двигаются сразу.
 */
@Injectable()
export class CampaignAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly revalidation: RevalidationService,
  ) {}

  async get(): Promise<CampaignAdminResponse> {
    const campaign = await this.prisma.campaign.findUnique({
      where: { slug: CAMPAIGN_SLUG },
      select: {
        id: true,
        slug: true,
        title: true,
        currency: true,
        goalKopecks: true,
        minDonationKopecks: true,
        stats: { select: { paidTotalKopecks: true, paidCount: true } },
        monthlyGoals: { select: GOAL_SELECT, orderBy: { periodStart: 'desc' } },
      },
    });

    if (campaign === null) {
      throw new NotFoundException('Сбор не найден — запустите сиды');
    }

    return {
      id: campaign.id,
      slug: campaign.slug,
      title: campaign.title,
      currency: campaign.currency,
      goalKopecks: campaign.goalKopecks.toString(),
      minDonationKopecks: campaign.minDonationKopecks.toString(),
      collectedKopecks: (campaign.stats?.paidTotalKopecks ?? 0n).toString(),
      donationsCount: campaign.stats?.paidCount ?? 0,
      monthlyGoals: campaign.monthlyGoals.map(toGoal),
    };
  }

  async updateGoal(dto: UpdateCampaignDto, actor: AdminPrincipal, meta: RequestMeta): Promise<CampaignAdminResponse> {
    const goalKopecks = parseGoal(dto.goalKopecks);

    await this.prisma.$transaction(async (tx) => {
      const before = await this.campaign(tx);

      await tx.campaign.update({ where: { id: before.id }, data: { goalKopecks } });
      await this.audit.record(tx, {
        actor: userActor(actor),
        action: 'campaign.update_goal',
        entityType: 'campaign',
        entityId: before.id,
        before: { goalKopecks: before.goalKopecks },
        after: { goalKopecks },
        meta,
      });
    });

    void this.revalidation.notify(['campaign']);

    return this.get();
  }

  async createMonthlyGoal(dto: CreateMonthlyGoalDto, actor: AdminPrincipal, meta: RequestMeta): Promise<MonthlyGoalAdminResponse> {
    const start = parseDateOnly(dto.periodStart);
    const end = parseDateOnly(dto.periodEnd);
    const goalKopecks = parseGoal(dto.goalKopecks);

    assertPeriod(start, end);

    const created = await this.withOverlapConflict(() =>
      this.prisma.$transaction(async (tx) => {
        const campaign = await this.campaign(tx);
        const collectedKopecks = await this.collectedInPeriod(tx, campaign.id, start, end);
        const row = await tx.campaignMonthlyGoal.create({
          data: { campaignId: campaign.id, periodStart: start, periodEnd: end, goalKopecks, collectedKopecks },
          select: GOAL_SELECT,
        });

        await this.audit.record(tx, {
          actor: userActor(actor),
          action: 'campaign.monthly_goal_create',
          entityType: 'campaign_monthly_goal',
          entityId: row.id,
          after: toGoal(row),
          meta,
        });

        return toGoal(row);
      }),
    );

    void this.revalidation.notify(['campaign']);

    return created;
  }

  async updateMonthlyGoal(
    id: string,
    dto: UpdateMonthlyGoalDto,
    actor: AdminPrincipal,
    meta: RequestMeta,
  ): Promise<MonthlyGoalAdminResponse> {
    const updated = await this.withOverlapConflict(() =>
      this.prisma.$transaction(async (tx) => {
        const before = await tx.campaignMonthlyGoal.findUnique({
          where: { id },
          select: { ...GOAL_SELECT, campaignId: true },
        });

        if (before === null) {
          throw new NotFoundException('Цель месяца не найдена');
        }

        const start = dto.periodStart === undefined ? before.periodStart : parseDateOnly(dto.periodStart);
        const end = dto.periodEnd === undefined ? before.periodEnd : parseDateOnly(dto.periodEnd);
        const periodChanged = start.getTime() !== before.periodStart.getTime() || end.getTime() !== before.periodEnd.getTime();

        assertPeriod(start, end);

        const row = await tx.campaignMonthlyGoal.update({
          where: { id },
          data: {
            ...(dto.goalKopecks === undefined ? {} : { goalKopecks: parseGoal(dto.goalKopecks) }),
            ...(periodChanged
              ? {
                  periodStart: start,
                  periodEnd: end,
                  collectedKopecks: await this.collectedInPeriod(tx, before.campaignId, start, end),
                }
              : {}),
          },
          select: GOAL_SELECT,
        });

        await this.audit.record(tx, {
          actor: userActor(actor),
          action: 'campaign.monthly_goal_update',
          entityType: 'campaign_monthly_goal',
          entityId: id,
          before: toGoal(before),
          after: toGoal(row),
          meta,
        });

        return toGoal(row);
      }),
    );

    void this.revalidation.notify(['campaign']);

    return updated;
  }

  async deleteMonthlyGoal(id: string, actor: AdminPrincipal, meta: RequestMeta): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const before = await tx.campaignMonthlyGoal.findUnique({ where: { id }, select: GOAL_SELECT });

      if (before === null) {
        throw new NotFoundException('Цель месяца не найдена');
      }

      await tx.campaignMonthlyGoal.delete({ where: { id } });
      await this.audit.record(tx, {
        actor: userActor(actor),
        action: 'campaign.monthly_goal_delete',
        entityType: 'campaign_monthly_goal',
        entityId: id,
        before: toGoal(before),
        meta,
      });
    });

    void this.revalidation.notify(['campaign']);
  }

  private async campaign(tx: Prisma.TransactionClient): Promise<{ id: string; goalKopecks: bigint }> {
    const campaign = await tx.campaign.findUnique({ where: { slug: CAMPAIGN_SLUG }, select: { id: true, goalKopecks: true } });

    if (campaign === null) {
      throw new NotFoundException('Сбор не найден — запустите сиды');
    }

    return campaign;
  }

  /**
   * «Собрано за период» для новой или сдвинутой цели месяца — теми же правилами,
   * что у триггера `donation_stats_apply`: оплаченные донаты сбора, месяц по Москве.
   *
   * Таблица целей блокируется в режиме SHARE ROW EXCLUSIVE до конца транзакции:
   * он конфликтует с ROW EXCLUSIVE, который берёт UPDATE триггера. Донат,
   * оплаченный параллельно, либо уже закоммичен и попадёт в сумму, либо
   * дождётся нашего коммита и увеличит уже новую строку — без пропуска и двойного счёта.
   */
  private async collectedInPeriod(tx: Prisma.TransactionClient, campaignId: string, start: Date, end: Date): Promise<bigint> {
    // Даты — строкой ГГГГ-ММ-ДД: Date ушёл бы как timestamptz и сдвинулся бы на день
    // при отрицательном часовом поясе сессии.
    await tx.$executeRaw`LOCK TABLE "campaign_monthly_goal" IN SHARE ROW EXCLUSIVE MODE`;

    const rows = await tx.$queryRaw<{ total: bigint }[]>`
      SELECT COALESCE(SUM("paid_amount_kopecks"), 0)::bigint AS "total"
        FROM "donation"
       WHERE "campaign_id" = ${campaignId}::uuid
         AND "status" = 'paid'
         AND ("paid_at" AT TIME ZONE 'Europe/Moscow')::date BETWEEN ${formatDateOnly(start)}::date AND ${formatDateOnly(end)}::date`;

    return rows[0]?.total ?? 0n;
  }

  private async withOverlapConflict<T>(action: () => Promise<T>): Promise<T> {
    try {
      return await action();
    } catch (error: unknown) {
      if (isExclusionViolation(error)) {
        throw new ConflictException('Период пересекается с другой целью месяца');
      }

      throw error;
    }
  }
}
