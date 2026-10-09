/**
 * Цели сбора (API.md §14). Даты целей месяца — `ГГГГ-ММ-ДД` по Москве,
 * обе включительно; здесь они не пересчитываются в пояса вовсе.
 */

import { LIMITS } from "./endpoints";
import { checkRublesInput } from "./money";
import { isPlainDate } from "./time";
import type { MonthlyGoalBody } from "./types";

export interface MonthlyGoalForm {
  readonly periodStart: string;
  readonly periodEnd: string;
  readonly amount: string;
}

export type MonthlyGoalErrors = Partial<Record<keyof MonthlyGoalForm, string>>;

export type MonthlyGoalCheck =
  | { readonly ok: true; readonly body: MonthlyGoalBody }
  | { readonly ok: false; readonly errors: MonthlyGoalErrors };

export function checkMonthlyGoal(form: MonthlyGoalForm): MonthlyGoalCheck {
  const errors: MonthlyGoalErrors = {};
  const amount = checkRublesInput(form.amount, { max: LIMITS.goalMaxKopecks, maxLabel: "10 000 000 000 ₽" });

  if (!isPlainDate(form.periodStart)) {
    errors.periodStart = "Укажите дату начала.";
  }

  if (!isPlainDate(form.periodEnd)) {
    errors.periodEnd = "Укажите дату окончания.";
  } else if (isPlainDate(form.periodStart) && form.periodEnd < form.periodStart) {
    errors.periodEnd = "Конец периода раньше начала.";
  }

  if (!amount.ok) {
    errors.amount = amount.error;
  }

  if (!amount.ok || Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }

  return { ok: true, body: { periodStart: form.periodStart, periodEnd: form.periodEnd, goalKopecks: amount.kopecks } };
}

/** Первый и последний день месяца даты `ГГГГ-ММ-ДД` — заготовка новой цели. */
export function monthBounds(date: string): { readonly start: string; readonly end: string } {
  const [year, month] = date.split("-").map(Number);
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const mm = String(month).padStart(2, "0");

  return { start: `${year}-${mm}-01`, end: `${year}-${mm}-${String(last).padStart(2, "0")}` };
}

/** Тело PATCH: только изменившиеся поля (все необязательны, §14). */
export function changedGoalFields(before: MonthlyGoalBody, after: MonthlyGoalBody): Partial<MonthlyGoalBody> {
  return Object.fromEntries(
    (Object.keys(after) as (keyof MonthlyGoalBody)[])
      .filter((key) => before[key] !== after[key])
      .map((key) => [key, after[key]]),
  );
}
