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

/** Доля от максимума 0…1 для высоты столбика; BigInt → Number только для пропорции. */
export function barRatios(days: readonly DayBar[]): number[] {
  const max = days.reduce((top, day) => (BigInt(day.totalKopecks) > top ? BigInt(day.totalKopecks) : top), BigInt(0));

  if (max === BigInt(0)) {
    return days.map(() => 0);
  }

  return days.map((day) => Number((BigInt(day.totalKopecks) * BigInt(1000)) / max) / 1000);
}
