import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../database/prisma.service';
import { CAMPAIGN_SLUG } from '../database/seed/campaign.data';
import { moscowToday } from '../showcase/moscow-date';
import { EXPORT_TIME_ZONE } from './csv';
import type { DashboardQueryDto } from './dto/dashboard.dto';

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_PERIOD_DAYS = 30;
/** Разбивка по дням длиннее года — это уже не дашборд, а выгрузка. */
const MAX_PERIOD_DAYS = 366;
const UTM_ROWS = 50;
const RECENT_ROWS = 10;

export interface DashboardResponse {
  readonly campaign: {
    readonly goalKopecks: string;
    readonly collectedKopecks: string;
    readonly donationsCount: number;
    readonly lastPaidAt: string | null;
  };
  readonly monthlyGoal: {
    readonly periodStart: string;
    readonly periodEnd: string;
    readonly goalKopecks: string;
    readonly collectedKopecks: string;
  } | null;
  readonly period: {
    readonly from: string;
    readonly to: string;
    readonly totalKopecks: string;
    readonly count: number;
    /** Средний чек, копейки, округление вниз; `"0"` без поступлений. */
    readonly averageKopecks: string;
  };
  /** По дням (часовой пояс Уфы), только дни с поступлениями. */
  readonly byDay: readonly { readonly date: string; readonly totalKopecks: string; readonly count: number }[];
  /** UTM first-touch; `null` — донат без метки. Сортировка по сумме. */
  readonly byUtm: readonly {
    readonly source: string | null;
    readonly medium: string | null;
    readonly campaign: string | null;
    readonly totalKopecks: string;
    readonly count: number;
  }[];
  readonly byMethod: readonly { readonly method: string | null; readonly totalKopecks: string; readonly count: number }[];
  /** Последние оплаченные — без ПДн, только то, что и так видно в ленте сайта, плюс номер счёта. */
  readonly recent: readonly {
    readonly id: string;
    readonly invoiceNo: number;
    readonly paidAt: string;
    readonly paidAmountKopecks: string;
    readonly provider: string;
    readonly method: string | null;
    readonly regionName: string | null;
    readonly donorName: string | null;
  }[];
}

interface Period {
  readonly from: Date;
  readonly to: Date;
}

export function resolvePeriod(query: DashboardQueryDto, now: Date = new Date()): Period {
  const to = query.to === undefined ? now : new Date(query.to);
  const from = query.from === undefined ? new Date(to.getTime() - DEFAULT_PERIOD_DAYS * DAY_MS) : new Date(query.from);

  if (from >= to) {
    throw new BadRequestException('from должен быть раньше to');
  }

  if (to.getTime() - from.getTime() > MAX_PERIOD_DAYS * DAY_MS) {
    throw new BadRequestException(`Период дашборда — не длиннее ${MAX_PERIOD_DAYS} дней`);
  }

  return { from, to };
}

/**
 * Дашборд админки. Всё считается в SQL одним проходом на срез — по оплаченным
 * донатам, по дате оплаты. Сумма сбора — из витрины `campaign_stats`, как на сайте.
 */
@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async get(query: DashboardQueryDto, now: Date = new Date()): Promise<DashboardResponse> {
    const { from, to } = resolvePeriod(query, now);
    const campaign = await this.prisma.campaign.findUnique({
      where: { slug: CAMPAIGN_SLUG },
      select: { id: true, goalKopecks: true, stats: { select: { paidTotalKopecks: true, paidCount: true, lastPaidAt: true } } },
    });

    if (campaign === null) {
      throw new NotFoundException('Сбор не найден — запустите сиды');
    }

    const today = moscowToday(now);
    const [monthlyGoal, totals, byDay, byUtm, byMethod, recent] = await Promise.all([
      this.prisma.campaignMonthlyGoal.findFirst({
        where: { campaignId: campaign.id, periodStart: { lte: today }, periodEnd: { gte: today } },
        select: { periodStart: true, periodEnd: true, goalKopecks: true, collectedKopecks: true },
      }),
      this.prisma.$queryRaw<{ total: bigint; count: bigint }[]>`
        SELECT COALESCE(SUM("paid_amount_kopecks"), 0)::bigint AS "total", COUNT(*)::bigint AS "count"
          FROM "donation"
         WHERE "campaign_id" = ${campaign.id}::uuid AND "status" = 'paid'
           AND "paid_at" >= ${from} AND "paid_at" < ${to}`,
      this.prisma.$queryRaw<{ day: string; total: bigint; count: bigint }[]>`
        SELECT to_char(("paid_at" AT TIME ZONE ${EXPORT_TIME_ZONE})::date, 'YYYY-MM-DD') AS "day",
               SUM("paid_amount_kopecks")::bigint AS "total", COUNT(*)::bigint AS "count"
          FROM "donation"
         WHERE "campaign_id" = ${campaign.id}::uuid AND "status" = 'paid'
           AND "paid_at" >= ${from} AND "paid_at" < ${to}
         GROUP BY 1 ORDER BY 1`,
      this.prisma.$queryRaw<{ source: string | null; medium: string | null; campaign: string | null; total: bigint; count: bigint }[]>`
        SELECT "utm_source" AS "source", "utm_medium" AS "medium", "utm_campaign" AS "campaign",
               SUM("paid_amount_kopecks")::bigint AS "total", COUNT(*)::bigint AS "count"
          FROM "donation"
         WHERE "campaign_id" = ${campaign.id}::uuid AND "status" = 'paid'
           AND "paid_at" >= ${from} AND "paid_at" < ${to}
         GROUP BY 1, 2, 3 ORDER BY 4 DESC, 5 DESC LIMIT ${UTM_ROWS}`,
      this.prisma.$queryRaw<{ method: string | null; total: bigint; count: bigint }[]>`
        SELECT "method", SUM("paid_amount_kopecks")::bigint AS "total", COUNT(*)::bigint AS "count"
          FROM "donation"
         WHERE "campaign_id" = ${campaign.id}::uuid AND "status" = 'paid'
           AND "paid_at" >= ${from} AND "paid_at" < ${to}
         GROUP BY 1 ORDER BY 2 DESC`,
      this.prisma.donation.findMany({
        where: { campaignId: campaign.id, status: 'paid' },
        orderBy: [{ paidAt: 'desc' }, { id: 'desc' }],
        take: RECENT_ROWS,
        select: {
          id: true,
          invoiceNo: true,
          paidAt: true,
          paidAmountKopecks: true,
          provider: true,
          method: true,
          donorName: true,
          region: { select: { name: true } },
        },
      }),
    ]);

    const total = totals[0]?.total ?? 0n;
    const count = Number(totals[0]?.count ?? 0n);

    return {
      campaign: {
        goalKopecks: campaign.goalKopecks.toString(),
        collectedKopecks: (campaign.stats?.paidTotalKopecks ?? 0n).toString(),
        donationsCount: campaign.stats?.paidCount ?? 0,
        lastPaidAt: campaign.stats?.lastPaidAt?.toISOString() ?? null,
      },
      monthlyGoal:
        monthlyGoal === null
          ? null
          : {
              periodStart: monthlyGoal.periodStart.toISOString().slice(0, 10),
              periodEnd: monthlyGoal.periodEnd.toISOString().slice(0, 10),
              goalKopecks: monthlyGoal.goalKopecks.toString(),
              collectedKopecks: monthlyGoal.collectedKopecks.toString(),
            },
      period: {
        from: from.toISOString(),
        to: to.toISOString(),
        totalKopecks: total.toString(),
        count,
        averageKopecks: count === 0 ? '0' : (total / BigInt(count)).toString(),
      },
      byDay: byDay.map((row) => ({ date: row.day, totalKopecks: row.total.toString(), count: Number(row.count) })),
      byUtm: byUtm.map((row) => ({
        source: row.source,
        medium: row.medium,
        campaign: row.campaign,
        totalKopecks: row.total.toString(),
        count: Number(row.count),
      })),
      byMethod: byMethod.map((row) => ({ method: row.method, totalKopecks: row.total.toString(), count: Number(row.count) })),
      recent: recent.flatMap((row) =>
        row.paidAt === null || row.paidAmountKopecks === null
          ? []
          : [
              {
                id: row.id,
                invoiceNo: row.invoiceNo,
                paidAt: row.paidAt.toISOString(),
                paidAmountKopecks: row.paidAmountKopecks.toString(),
                provider: row.provider,
                method: row.method,
                regionName: row.region?.name ?? null,
                donorName: row.donorName,
              },
            ],
      ),
    };
  }
}
