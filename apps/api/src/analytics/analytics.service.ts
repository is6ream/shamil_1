import { Injectable } from '@nestjs/common';

import { resolvePeriod } from '../admin/dashboard.service';
import { PrismaService } from '../database/prisma.service';
import { Prisma } from '../generated/prisma/client';
import type {
  AttributionModel,
  DonationsBySourceQueryDto,
  SourceGrouping,
} from './dto/donations-by-source.dto';

const DEFAULT_MODEL: AttributionModel = 'last';
const DEFAULT_GROUPING: SourceGrouping = 'source';

/** Строк в ответе не больше: длинный хвост разовых меток читать всё равно некому. */
const MAX_ROWS = 200;

/** Колонки моделей. Имена — только отсюда: в SQL они попадают через `Prisma.raw`. */
const MODEL_COLUMNS: Readonly<Record<AttributionModel, { source: string; campaign: string; content: string }>> = {
  first: { source: '"utm_source"', campaign: '"utm_campaign"', content: '"utm_content"' },
  last: { source: '"last_utm_source"', campaign: '"last_utm_campaign"', content: '"last_utm_content"' },
};

const HOW_DID_YOU_HEAR_COLUMN = '"how_did_you_hear"';

export interface SourceAggregate {
  readonly count: number;
  readonly totalKopecks: string;
  readonly averageKopecks: string;
}

export interface SourceRow extends SourceAggregate {
  /** Источник; для `how_did_you_hear` — ответ из формы перевода. */
  readonly source: string;
  /** Только при `groupBy=campaign|content`. `null` — метки кампании не было. */
  readonly campaign?: string | null;
  /** Только при `groupBy=content`. */
  readonly content?: string | null;
}

export interface DonationsBySourceResponse {
  readonly period: { readonly from: string; readonly to: string };
  readonly model: AttributionModel;
  readonly groupBy: SourceGrouping;
  readonly rows: readonly SourceRow[];
  /** Оплаченные без атрибуции: cookie не было, ручное поступление, перевод без ответа. */
  readonly unattributed: SourceAggregate;
  readonly total: SourceAggregate;
}

interface Grouping {
  /** Колонка, `NULL` в которой — «без атрибуции». */
  readonly key: string;
  readonly columns: readonly { readonly alias: 'source' | 'campaign' | 'content'; readonly column: string }[];
}

interface AggregateRow {
  readonly count: bigint;
  readonly total: bigint;
}

interface GroupedRow extends AggregateRow {
  readonly source: string;
  readonly campaign?: string | null;
  readonly content?: string | null;
}

interface TotalsRow extends AggregateRow {
  readonly unattributedCount: bigint;
  readonly unattributedTotal: bigint;
}

function grouping(model: AttributionModel, groupBy: SourceGrouping): Grouping {
  if (groupBy === 'how_did_you_hear') {
    return { key: HOW_DID_YOU_HEAR_COLUMN, columns: [{ alias: 'source', column: HOW_DID_YOU_HEAR_COLUMN }] };
  }

  const columns = MODEL_COLUMNS[model];
  const bySource = [{ alias: 'source', column: columns.source }] as const;

  if (groupBy === 'source') {
    return { key: columns.source, columns: bySource };
  }

  const byCampaign = [...bySource, { alias: 'campaign', column: columns.campaign }] as const;

  return {
    key: columns.source,
    columns: groupBy === 'campaign' ? byCampaign : [...byCampaign, { alias: 'content', column: columns.content }],
  };
}

function aggregate(count: bigint, total: bigint): SourceAggregate {
  return {
    count: Number(count),
    totalKopecks: total.toString(),
    // Целочисленное деление копеек: доли копейки в отчёте не нужны,
    // а double на деньгах сбора расходится с выпиской.
    averageKopecks: count === 0n ? '0' : (total / count).toString(),
  };
}

/**
 * Отчёт «пожертвования по источникам». Только `status = 'paid'` и только
 * по дате оплаты: pending-заказ — это намерение, а не деньги, и отчёт,
 * считающий намерения, завышал бы каналы, где люди бросают оплату.
 *
 * Сумма — `paid_amount_kopecks` из колбэка провайдера, как в витринах сбора.
 */
@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async donationsBySource(
    query: DonationsBySourceQueryDto,
    now: Date = new Date(),
  ): Promise<DonationsBySourceResponse> {
    const { from, to } = resolvePeriod(query, now);
    const model = query.model ?? DEFAULT_MODEL;
    const groupBy = query.groupBy ?? DEFAULT_GROUPING;
    const { key, columns } = grouping(model, groupBy);

    const keyColumn = Prisma.raw(key);
    const selectColumns = Prisma.join(
      columns.map(({ alias, column }) => Prisma.raw(`${column} AS "${alias}"`)),
    );
    const groupColumns = Prisma.join(columns.map(({ column }) => Prisma.raw(column)));
    const paidInPeriod = Prisma.sql`"status" = 'paid' AND "paid_at" >= ${from} AND "paid_at" < ${to}`;

    const [rows, totals] = await Promise.all([
      this.prisma.$queryRaw<GroupedRow[]>`
        SELECT ${selectColumns},
               COUNT(*)::bigint AS "count",
               COALESCE(SUM("paid_amount_kopecks"), 0)::bigint AS "total"
          FROM "donation"
         WHERE ${paidInPeriod} AND ${keyColumn} IS NOT NULL
         GROUP BY ${groupColumns}
         ORDER BY "total" DESC, "count" DESC
         LIMIT ${MAX_ROWS}`,
      this.prisma.$queryRaw<TotalsRow[]>`
        SELECT COUNT(*)::bigint AS "count",
               COALESCE(SUM("paid_amount_kopecks"), 0)::bigint AS "total",
               COUNT(*) FILTER (WHERE ${keyColumn} IS NULL)::bigint AS "unattributedCount",
               COALESCE(SUM("paid_amount_kopecks") FILTER (WHERE ${keyColumn} IS NULL), 0)::bigint AS "unattributedTotal"
          FROM "donation"
         WHERE ${paidInPeriod}`,
    ]);

    const totalsRow = totals[0];

    return {
      period: { from: from.toISOString(), to: to.toISOString() },
      model,
      groupBy,
      rows: rows.map((row) => ({
        source: row.source,
        ...(row.campaign === undefined ? {} : { campaign: row.campaign }),
        ...(row.content === undefined ? {} : { content: row.content }),
        ...aggregate(row.count, row.total),
      })),
      unattributed: aggregate(totalsRow?.unattributedCount ?? 0n, totalsRow?.unattributedTotal ?? 0n),
      total: aggregate(totalsRow?.count ?? 0n, totalsRow?.total ?? 0n),
    };
  }
}
