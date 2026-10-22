/**
 * Этапы сбора в админке: форма (рубли ↔ копейки), проверки до отправки,
 * доступные действия по статусу и превью блока главной.
 *
 * Границы — зеркало бэкенда (`fundraising-goals.constants.ts`, CHECK в миграции):
 * форма отвечает раньше, чем сервер вернёт 400.
 */

import type { ActiveGoal } from "@/lib/goal-progress";

import { LIMITS } from "./endpoints";
import { checkRublesInput, formatKopecks, rublesToKopecks } from "./money";
import { toUfaDateTimeInput, ufaDateTimeInputToIso } from "./time";
import type { FundraisingGoalBody, FundraisingGoalRecord, FundraisingGoalStatus } from "./types";

export const GOAL_TITLE_MIN = 3;
export const GOAL_TITLE_MAX = 80;
export const GOAL_DESCRIPTION_MAX = 200;

const NO_HTML = /[<>]/;

export const GOAL_STATUS_LABELS: Readonly<Record<FundraisingGoalStatus, string>> = {
  ACTIVE: "На сайте",
  DRAFT: "Черновик",
  COMPLETED: "Завершён",
  ARCHIVED: "В архиве",
};

export const GOAL_STATUS_TONES: Readonly<Record<FundraisingGoalStatus, "success" | "neutral" | "info" | "warning">> = {
  ACTIVE: "success",
  DRAFT: "neutral",
  COMPLETED: "info",
  ARCHIVED: "warning",
};

export interface GoalActions {
  readonly canEdit: boolean;
  readonly canActivate: boolean;
  readonly canComplete: boolean;
  readonly canArchive: boolean;
}

/** То же, что разрешает сервер: в черновик не возвращаются, архив — финален. */
export function goalActions(status: FundraisingGoalStatus): GoalActions {
  return {
    canEdit: status !== "ARCHIVED",
    canActivate: status === "DRAFT" || status === "COMPLETED",
    canComplete: status === "ACTIVE",
    canArchive: status !== "ARCHIVED",
  };
}

/** Что набрано в форме. Даты — значения `datetime-local` по Уфе. */
export interface GoalForm {
  readonly title: string;
  readonly description: string;
  readonly target: string;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly adjustment: string;
}

export type GoalFormErrors = Partial<Record<keyof GoalForm, string>>;

export type GoalFormCheck =
  | { readonly ok: true; readonly body: FundraisingGoalBody }
  | { readonly ok: false; readonly errors: GoalFormErrors };

export function initialGoalForm(goal: FundraisingGoalRecord | null, now: number = Date.now()): GoalForm {
  if (goal === null) {
    return { title: "", description: "", target: "", startsAt: toUfaDateTimeInput(now), endsAt: "", adjustment: "0" };
  }

  return {
    title: goal.title,
    description: goal.description ?? "",
    target: kopecksToInput(goal.targetAmountKopecks),
    startsAt: toUfaDateTimeInput(new Date(goal.startsAt)),
    endsAt: goal.endsAt === null ? "" : toUfaDateTimeInput(new Date(goal.endsAt)),
    adjustment: kopecksToInput(goal.manualAdjustmentKopecks),
  };
}

function kopecksToInput(kopecks: string): string {
  const value = BigInt(kopecks);
  const absolute = value < BigInt(0) ? -value : value;
  const rubles = absolute / BigInt(100);
  const rest = absolute % BigInt(100);
  const body = rest === BigInt(0) ? `${rubles}` : `${rubles},${rest.toString().padStart(2, "0")}`;

  return value < BigInt(0) ? `-${body}` : body;
}

/**
 * Рубли со знаком → копейки строкой. Минус — обычный, «−» или «–»:
 * их подставляют клавиатуры телефонов. `null` — не сумма.
 */
export function signedRublesToKopecks(raw: string): string | null {
  const cleaned = raw.trim().replace(/^[−–]/, "-");
  const isNegative = cleaned.startsWith("-");
  const kopecks = rublesToKopecks(isNegative ? cleaned.slice(1) : cleaned);

  if (kopecks === null) {
    return null;
  }

  return isNegative && kopecks !== "0" ? `-${kopecks}` : kopecks;
}

function checkTitle(title: string): string | null {
  const trimmed = title.trim();

  if (trimmed.length < GOAL_TITLE_MIN || trimmed.length > GOAL_TITLE_MAX) {
    return `Название — от ${GOAL_TITLE_MIN} до ${GOAL_TITLE_MAX} символов.`;
  }

  return NO_HTML.test(trimmed) ? "Без угловых скобок < и >." : null;
}

function checkDescription(description: string): string | null {
  const trimmed = description.trim();

  if (trimmed.length > GOAL_DESCRIPTION_MAX) {
    return `Не длиннее ${GOAL_DESCRIPTION_MAX} символов.`;
  }

  return NO_HTML.test(trimmed) ? "Без угловых скобок < и >." : null;
}

function checkAdjustment(raw: string): { kopecks: string } | { error: string } {
  const kopecks = signedRublesToKopecks(raw === "" ? "0" : raw);

  if (kopecks === null) {
    return { error: "Введите сумму цифрами, например 15 000 или -2 000." };
  }

  const absolute = kopecks.startsWith("-") ? kopecks.slice(1) : kopecks;

  if (BigInt(absolute) > BigInt(LIMITS.stageAdjustmentMaxKopecks)) {
    return { error: `Не больше ${formatKopecks(LIMITS.stageAdjustmentMaxKopecks)} по модулю.` };
  }

  return { kopecks };
}

/** Проверка формы и тело для API. Пустое описание и конец — `null`. */
export function checkGoalForm(form: GoalForm): GoalFormCheck {
  const errors: GoalFormErrors = {};

  const titleError = checkTitle(form.title);
  const descriptionError = checkDescription(form.description);
  const target = checkRublesInput(form.target, {
    min: LIMITS.stageGoalMinKopecks,
    max: LIMITS.stageGoalMaxKopecks,
  });
  const adjustment = checkAdjustment(form.adjustment.trim());
  const startsAt = ufaDateTimeInputToIso(form.startsAt);
  const endsAt = form.endsAt === "" ? null : ufaDateTimeInputToIso(form.endsAt);

  if (titleError !== null) errors.title = titleError;
  if (descriptionError !== null) errors.description = descriptionError;
  if (!target.ok) errors.target = target.error;
  if ("error" in adjustment) errors.adjustment = adjustment.error;
  if (startsAt === null) errors.startsAt = "Укажите дату и время начала.";
  if (form.endsAt !== "" && endsAt === null) errors.endsAt = "Дата окончания заполнена не полностью.";
  if (startsAt !== null && endsAt !== null && Date.parse(endsAt) <= Date.parse(startsAt)) {
    errors.endsAt = "Окончание должно быть позже начала.";
  }

  if (Object.keys(errors).length > 0 || !target.ok || "error" in adjustment || startsAt === null) {
    return { ok: false, errors };
  }

  const description = form.description.trim();

  return {
    ok: true,
    body: {
      title: form.title.trim(),
      description: description === "" ? null : description,
      targetAmountKopecks: target.kopecks,
      startsAt,
      endsAt,
      manualAdjustmentKopecks: adjustment.kopecks,
    },
  };
}

/** Для правки — только изменившиеся поля: меньше шума в журнале действий. */
export function changedGoalBody(goal: FundraisingGoalRecord, body: FundraisingGoalBody): Partial<FundraisingGoalBody> {
  const before: FundraisingGoalBody = {
    title: goal.title,
    description: goal.description,
    targetAmountKopecks: goal.targetAmountKopecks,
    startsAt: goal.startsAt,
    endsAt: goal.endsAt,
    manualAdjustmentKopecks: goal.manualAdjustmentKopecks,
  };

  return Object.fromEntries(
    (Object.keys(body) as (keyof FundraisingGoalBody)[])
      .filter((key) => !sameValue(key, before[key], body[key]))
      .map((key) => [key, body[key]]),
  ) as Partial<FundraisingGoalBody>;
}

function sameValue(key: keyof FundraisingGoalBody, a: string | null, b: string | null): boolean {
  if ((key === "startsAt" || key === "endsAt") && a !== null && b !== null) {
    return Date.parse(a) === Date.parse(b);
  }

  return a === b;
}

const HUNDRED = BigInt(100);
const ZERO = BigInt(0);

/**
 * Превью блока главной по тому, что набрано в форме. Собрано — как посчитает
 * сервер: пожертвования за период (известны только у сохранённого этапа)
 * плюс корректировка, не ниже нуля. `null` — форма пока не даёт цели.
 */
export function previewGoal(form: GoalForm, paidKopecks: string, id = "preview"): ActiveGoal | null {
  const target = rublesToKopecks(form.target);
  const adjustment = signedRublesToKopecks(form.adjustment === "" ? "0" : form.adjustment);

  if (target === null || BigInt(target) <= ZERO) {
    return null;
  }

  const sum = BigInt(paidKopecks) + BigInt(adjustment ?? "0");
  const collected = sum > ZERO ? sum : ZERO;
  const raw = (collected * HUNDRED) / BigInt(target);
  const description = form.description.trim();

  return {
    id,
    title: form.title.trim() === "" ? "Название этапа" : form.title.trim(),
    description: description === "" ? null : description,
    targetAmountKopecks: target,
    collectedAmountKopecks: collected.toString(),
    percent: Number(raw > HUNDRED ? HUNDRED : raw),
    isReached: collected >= BigInt(target),
  };
}
