import type { RegionType } from '../../generated/prisma/enums';
import { moscowDayEnd, moscowDayStart } from '../moscow-date';
import type {
  CampaignResponse,
  DonorRankRowResponse,
  FeedItemResponse,
  GalleryItemResponse,
  MonthlyGoalResponse,
  RegionRankRowResponse,
  RegionResponse,
} from './showcase-response.dto';

/**
 * Строки БД → ответы витрины. Каждая входная форма — ровно те поля, что
 * перечислены в `select` сервиса: маппер не может случайно вытащить
 * то, чего сервис не читал.
 */

export interface CampaignRow {
  readonly goalKopecks: bigint;
}

export interface CampaignStatsRow {
  readonly paidTotalKopecks: bigint;
  readonly paidCount: number;
  readonly lastPaidAt: Date | null;
}

export interface MonthlyGoalRow {
  readonly goalKopecks: bigint;
  readonly collectedKopecks: bigint;
  readonly periodStart: Date;
  readonly periodEnd: Date;
}

export function toMonthlyGoalResponse(row: MonthlyGoalRow): MonthlyGoalResponse {
  return {
    goalKopecks: row.goalKopecks.toString(),
    collectedKopecks: row.collectedKopecks.toString(),
    periodStart: moscowDayStart(row.periodStart).toISOString(),
    periodEnd: moscowDayEnd(row.periodEnd).toISOString(),
  };
}

/** Нет строки счётчиков — до первого платежа это нули, а не ошибка. */
export function toCampaignResponse(
  campaign: CampaignRow,
  stats: CampaignStatsRow | null,
  monthlyGoal: MonthlyGoalRow | null,
): CampaignResponse {
  return {
    goalKopecks: campaign.goalKopecks.toString(),
    collectedKopecks: stats?.paidTotalKopecks.toString() ?? '0',
    donationsCount: stats?.paidCount ?? 0,
    lastPaidAt: stats?.lastPaidAt?.toISOString() ?? null,
    monthlyGoal: monthlyGoal === null ? null : toMonthlyGoalResponse(monthlyGoal),
  };
}

export interface RegionRow {
  readonly slug: string;
  readonly code: string | null;
  readonly countryCode: string;
  readonly name: string;
  readonly type: RegionType;
  readonly flagUrl: string | null;
}

/** У страны `code` пуст — фронтенд ждёт строку, и для страны это код страны. */
export function toRegionResponse(row: RegionRow): RegionResponse {
  return {
    slug: row.slug,
    code: row.code ?? row.countryCode,
    name: row.name,
    type: row.type,
    flagUrl: row.flagUrl,
  };
}

export interface RegionRankRow {
  readonly paidTotalKopecks: bigint;
  readonly paidCount: number;
  readonly region: { readonly slug: string; readonly name: string; readonly flagUrl: string | null };
}

export function toRegionRankRowResponse(row: RegionRankRow): RegionRankRowResponse {
  return {
    slug: row.region.slug,
    name: row.region.name,
    flagUrl: row.region.flagUrl,
    donorsCount: row.paidCount,
    paidTotalKopecks: row.paidTotalKopecks.toString(),
  };
}

export interface DonorRow {
  readonly donorName: string | null;
  readonly paidAmountKopecks: bigint | null;
}

/**
 * Выборка уже отфильтровала `paid` и неанонимных, а CHECK `donation_paid_fields`
 * гарантирует сумму у оплаченного. Пустое имя у неанонимного всё же возможно
 * (донатер снял галочку, но не подписался) — такие строки сервис отбрасывает
 * до маппера, здесь их быть не должно.
 */
export function toDonorRankRowResponse(row: DonorRow): DonorRankRowResponse {
  return {
    donorName: row.donorName ?? '',
    paidAmountKopecks: (row.paidAmountKopecks ?? 0n).toString(),
  };
}

export interface FeedRow {
  readonly id: string;
  readonly paidAt: Date | null;
  readonly paidAmountKopecks: bigint | null;
  readonly method: string | null;
  readonly isAnonymous: boolean;
  readonly donorName: string | null;
  readonly region: { readonly name: string } | null;
}

export function toFeedItemResponse(row: FeedRow): FeedItemResponse {
  return {
    id: row.id,
    // У `paid` оба поля обязательны по CHECK `donation_paid_fields`;
    // в ленту другие статусы не попадают.
    paidAt: (row.paidAt ?? new Date(0)).toISOString(),
    amountKopecks: (row.paidAmountKopecks ?? 0n).toString(),
    method: row.method,
    regionName: row.region?.name ?? null,
    // Анонимность проверяется явно, а не только через пустое имя: подпись
    // анонимного доната не должна выйти наружу даже при сбое CHECK.
    donorName: row.isAnonymous ? null : row.donorName,
  };
}

/**
 * Названия месяцев в именительном падеже. Не `Intl`: в `ru-RU` он даёт
 * «июнь 2026 г.» для месяца с годом и родительный падеж («июня») в форматах
 * с днём — а подпись под фото стройки нужна ровно «июнь 2026».
 */
const MONTHS_NOMINATIVE = [
  'январь',
  'февраль',
  'март',
  'апрель',
  'май',
  'июнь',
  'июль',
  'август',
  'сентябрь',
  'октябрь',
  'ноябрь',
  'декабрь',
] as const;

/** Колонка `date` приходит полночью UTC — месяц берём в UTC, без сдвига зоны. */
export function formatTakenAtLabel(takenOn: Date | null): string {
  if (takenOn === null) {
    return '';
  }

  return `${MONTHS_NOMINATIVE[takenOn.getUTCMonth()]} ${takenOn.getUTCFullYear()}`;
}

export interface GalleryRow {
  readonly id: string;
  readonly imageUrl: string;
  readonly caption: string | null;
  readonly altText: string | null;
  readonly takenOn: Date | null;
}

export function toGalleryItemResponse(row: GalleryRow): GalleryItemResponse {
  return {
    id: row.id,
    url: row.imageUrl,
    caption: row.caption ?? row.altText ?? '',
    takenAtLabel: formatTakenAtLabel(row.takenOn),
  };
}
