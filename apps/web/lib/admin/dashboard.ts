/**
 * Дашборд (API.md §15): период запроса и дни графика.
 *
 * Период — по дате оплаты, дни — по Уфе. `byDay` приходит только с днями,
 * где были поступления; пропуски дорисовываем нулями, иначе столбики
 * соседних дней встанут рядом и график соврёт.
 */

import { LIMITS } from "./endpoints";
import { addDays, daysBetween, daysInclusive, isPlainDate, nextDay, ufaDayKey, ufaDayStartIso } from "./time";
import type { Dashboard } from "./types";

export type PeriodPreset = "7" | "30" | "90" | "custom";

export interface DashboardPeriod {
  readonly preset: PeriodPreset;
  /** Для «свой»: даты по Уфе включительно. */
  readonly from: string;
  readonly to: string;
}

export interface ResolvedPeriod {
  /** Даты по Уфе включительно — для графика. */
  readonly fromDay: string;
  readonly toDay: string;
  /** Для API: `to` не включительно. */
  readonly params: { readonly from: string; readonly to: string };
}

export type PeriodCheck = { readonly ok: true; readonly period: ResolvedPeriod } | { readonly ok: false; readonly error: string };

export function resolvePeriod(period: DashboardPeriod, now: number = Date.now()): PeriodCheck {
  let fromDay: string;
  let toDay: string;

  if (period.preset === "custom") {
    if (!isPlainDate(period.from) || !isPlainDate(period.to)) {
      return { ok: false, error: "Выберите обе даты периода." };
    }

    if (period.from > period.to) {
      return { ok: false, error: "Конец периода раньше начала." };
    }

    if (daysInclusive(period.from, period.to) > LIMITS.dashboardMaxDays) {
      return { ok: false, error: `Период — не длиннее ${LIMITS.dashboardMaxDays} дней.` };
    }

    fromDay = period.from;
    toDay = period.to;
  } else {
    toDay = ufaDayKey(now);
    fromDay = addDays(toDay, 1 - Number(period.preset));
  }

  return {
    ok: true,
    period: { fromDay, toDay, params: { from: ufaDayStartIso(fromDay), to: ufaDayStartIso(nextDay(toDay)) } },
  };
}

export interface DayBar {
  readonly date: string;
  readonly totalKopecks: string;
  readonly count: number;
}

/** Все дни периода; дни без поступлений — нули. */
export function fillDays(byDay: Dashboard["byDay"], fromDay: string, toDay: string): DayBar[] {
  const known = new Map(byDay.map((day) => [day.date, day]));

  return daysBetween(fromDay, toDay).map(
    (date) => known.get(date) ?? { date, totalKopecks: "0", count: 0 },
  );
}

/** Помесячный график: последние 3, 6 или 12 месяцев. Больше — упрётся в лимит периода API. */
export type MonthsWindow = 3 | 6 | 12;

export const MONTH_WINDOWS: readonly MonthsWindow[] = [3, 6, 12];

/**
 * С 1-го числа месяца, отстоящего на `months − 1` назад, по сегодня (Уфа).
 * Текущий месяц неполный — это честнее, чем дорисовывать будущие дни.
 * 12 месяцев — максимум 366 дней, лимит `LIMITS.dashboardMaxDays` не превышается.
 */
export function resolveMonths(months: MonthsWindow, now: number = Date.now()): ResolvedPeriod {
  const toDay = ufaDayKey(now);
  const [year, month] = toDay.split("-").map(Number);
  const start = new Date(Date.UTC(year, month - months, 1));
  const fromDay = start.toISOString().slice(0, 10);

  return { fromDay, toDay, params: { from: ufaDayStartIso(fromDay), to: ufaDayStartIso(nextDay(toDay)) } };
}

/**
 * Дни → месяцы (`ГГГГ-ММ`), все месяцы периода, пустые — нули. Суммы —
 * в BigInt: копейки за год легко выходят за точность Number.
 */
export function groupByMonth(byDay: Dashboard["byDay"], fromDay: string, toDay: string): DayBar[] {
  const totals = new Map<string, { total: bigint; count: number }>();

  for (const day of daysBetween(fromDay, toDay)) {
    totals.set(day.slice(0, 7), { total: BigInt(0), count: 0 });
  }

  for (const day of byDay) {
    const month = totals.get(day.date.slice(0, 7));

    if (month && day.date >= fromDay && day.date <= toDay) {
      totals.set(day.date.slice(0, 7), { total: month.total + BigInt(day.totalKopecks), count: month.count + day.count });
    }
  }

  return [...totals].map(([date, { total, count }]) => ({ date, totalKopecks: total.toString(), count }));
}

/** «2026-10» → «октябрь 2026» или «окт» для оси. */
export function monthLabel(month: string, form: "long" | "short" = "long"): string {
  const [year, index] = month.split("-").map(Number);
  const name = new Date(Date.UTC(year, index - 1, 1))
    .toLocaleDateString("ru-RU", { month: form, timeZone: "UTC" })
    .replace(/\.$/, "");

  return form === "long" ? `${name} ${year}` : name;
}

/** Доля от максимума 0…1 для высоты столбика; BigInt → Number только для пропорции. */
export function barRatios(days: readonly DayBar[]): number[] {
  const max = days.reduce((top, day) => (BigInt(day.totalKopecks) > top ? BigInt(day.totalKopecks) : top), BigInt(0));

  if (max === BigInt(0)) {
    return days.map(() => 0);
  }

  return days.map((day) => Number((BigInt(day.totalKopecks) * BigInt(1000)) / max) / 1000);
}
