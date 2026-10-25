import { ForbiddenException, Injectable } from '@nestjs/common';

import { AuditService } from '../audit/audit.service';
import { userActor } from '../audit/audit.types';
import type { AdminPrincipal, RequestMeta } from '../auth/auth.types';
import { canSeePersonalData } from '../auth/roles';
import { pageArgs } from '../common/pagination';
import type { Page } from '../common/pagination';
import { PrismaService } from '../database/prisma.service';
import type { Prisma } from '../generated/prisma/client';
import { DonationStatus, SubscriptionStatus } from '../generated/prisma/enums';
import { maskEmail } from '../mail/log-mail.sender';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import type {
  AdminSubscriptionResponse,
  AdminSubscriptionStatsResponse,
  AdminSubscriptionsQueryDto,
  MonthlyChargeStats,
} from './dto/admin-subscriptions.dto';

/** Окно статистики автосписаний. */
const STATS_MONTHS = 12;

/**
 * Подписки в админке: список с фильтрами, статистика (MRR, отказы
 * по месяцам) и ручная отмена. Отмена идёт через тот же
 * `SubscriptionsService.cancel`, что и у жертвователя, — с записью
 * в журнал в той же транзакции.
 */
@Injectable()
export class AdminSubscriptionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly subscriptions: SubscriptionsService,
    private readonly audit: AuditService,
  ) {}

  async list(query: AdminSubscriptionsQueryDto, admin: AdminPrincipal): Promise<Page<AdminSubscriptionResponse>> {
    const seesEmail = canSeePersonalData(admin.role);

    if (query.email !== undefined && !seesEmail) {
      // Поиск по адресу раскрыл бы его тому, кому адреса не показываем.
      throw new ForbiddenException('Поиск по e-mail доступен только ролям с доступом к персональным данным');
    }

    const where: Prisma.SubscriptionWhereInput = {
      ...(query.status === undefined ? {} : { status: query.status }),
      ...(query.email === undefined ? {} : { user: { email: { contains: query.email } } }),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.subscription.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        ...pageArgs(query),
        include: { user: { select: { email: true } }, region: { select: { name: true } } },
      }),
      this.prisma.subscription.count({ where }),
    ]);
    const paid = await this.prisma.donation.groupBy({
      by: ['subscriptionId'],
      where: { subscriptionId: { in: rows.map((row) => row.id) }, status: DonationStatus.paid },
      _count: { _all: true },
      _sum: { paidAmountKopecks: true },
    });
    const paidBySubscription = new Map(paid.map((group) => [group.subscriptionId, group]));

    return {
      items: rows.map((row) => {
        const totals = paidBySubscription.get(row.id);

        return {
          id: row.id,
          status: row.status,
          amountKopecks: row.amountKopecks.toString(),
          donorEmail: seesEmail ? row.user.email : maskEmail(row.user.email),
          regionName: row.region?.name ?? null,
          nextChargeAt: row.status === SubscriptionStatus.ACTIVE ? (row.nextChargeAt?.toISOString() ?? null) : null,
          failCount: row.failCount,
          lastFailureReason: row.lastFailureReason,
          paidCount: totals?._count._all ?? 0,
          paidTotalKopecks: (totals?._sum.paidAmountKopecks ?? 0n).toString(),
          createdAt: row.createdAt.toISOString(),
          cancelledAt: row.cancelledAt?.toISOString() ?? null,
          cancelSource: row.cancelSource,
        };
      }),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async stats(): Promise<AdminSubscriptionStatsResponse> {
    const [byStatus, mrr, charges] = await Promise.all([
      this.prisma.subscription.groupBy({ by: ['status'], _count: { _all: true } }),
      this.prisma.subscription.aggregate({
        where: { status: SubscriptionStatus.ACTIVE },
        _sum: { amountKopecks: true },
      }),
      // Месяц — по Москве, как у цели месяца на витрине.
      this.prisma.$queryRaw<MonthlyChargeStats[]>`
        SELECT to_char(date_trunc('month', created_at AT TIME ZONE 'Europe/Moscow'), 'YYYY-MM') AS month,
               (count(*) FILTER (WHERE status = 'paid'))::int AS paid,
               (count(*) FILTER (WHERE status = 'failed'))::int AS failed
          FROM "donation"
         WHERE type = 'CHILD'
           AND created_at >= now() - make_interval(months => ${STATS_MONTHS})
         GROUP BY 1
         ORDER BY 1`,
    ]);
    const count = (status: SubscriptionStatus): number =>
      byStatus.find((group) => group.status === status)?._count._all ?? 0;

    return {
      active: count(SubscriptionStatus.ACTIVE),
      paused: count(SubscriptionStatus.PAUSED),
      pending: count(SubscriptionStatus.PENDING),
      failed: count(SubscriptionStatus.FAILED),
      cancelled: count(SubscriptionStatus.CANCELLED),
      mrrKopecks: (mrr._sum.amountKopecks ?? 0n).toString(),
      charges,
    };
  }

  /** Отмена администратором. Журнал — в транзакции отмены; повтор — no-op без записи. */
  async cancel(id: string, admin: AdminPrincipal, meta: RequestMeta): Promise<{ id: string; changed: boolean }> {
    return this.subscriptions.cancel(id, 'admin', {
      onCancelled: (tx, previousStatus) =>
        this.audit.record(tx, {
          actor: userActor(admin),
          action: 'subscription.cancel',
          entityType: 'subscription',
          entityId: id,
          before: { status: previousStatus },
          after: { status: SubscriptionStatus.CANCELLED, cancelSource: 'admin' },
          meta,
        }),
    });
  }
}
