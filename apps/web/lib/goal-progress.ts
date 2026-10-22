/**
 * Активный этап сбора для первого экрана: разбор ответа API и форматирование.
 *
 * Отдельно от компонента, чтобы тестироваться без браузера: ответ бэкенда —
 * внешние данные, и битая строка не должна уронить главную.
 */

/** Ответ `GET /api/public/goals/active`. Деньги — копейки строкой. */
export interface ActiveGoal {
  readonly id: string;
  readonly title: string;
  readonly description: string | null;
  readonly targetAmountKopecks: string;
  readonly collectedAmountKopecks: string;
  /** Целый, 0–100: сервер уже обрезал перевыполнение. */
  readonly percent: number;
  readonly isReached: boolean;
}

const KOPECKS = /^\d{1,16}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * `null` — этапа нет или ответ не той формы. Во втором случае блок просто
 * не рисуется: показать кривые цифры в сборе хуже, чем не показать этап.
 */
export function parseActiveGoal(body: unknown): ActiveGoal | null {
  if (!isRecord(body)) {
    return null;
  }

  const { id, title, description, targetAmountKopecks, collectedAmountKopecks, percent, isReached } = body;

  if (
    typeof id !== "string" ||
    typeof title !== "string" ||
    title.trim() === "" ||
    (description !== null && typeof description !== "string") ||
    typeof targetAmountKopecks !== "string" ||
    !KOPECKS.test(targetAmountKopecks) ||
    targetAmountKopecks === "0" ||
    typeof collectedAmountKopecks !== "string" ||
    !KOPECKS.test(collectedAmountKopecks) ||
    typeof percent !== "number" ||
    !Number.isInteger(percent) ||
    typeof isReached !== "boolean"
  ) {
    return null;
  }

  return {
    id,
    title,
    description,
    targetAmountKopecks,
    collectedAmountKopecks,
    percent: Math.min(100, Math.max(0, percent)),
    isReached,
  };
}

const rublesFormat = new Intl.NumberFormat("ru-RU", {
  style: "currency",
  currency: "RUB",
  maximumFractionDigits: 0,
});

/**
 * Любой пробел ICU (обычный, узкий неразрывный U+202F, неразрывный) —
 * к одному неразрывному. Node и браузер могут разойтись версией ICU,
 * и без этого сумма давала бы hydration mismatch; знак ₽ не отрывается от числа.
 */
function normalizeSpaces(text: string): string {
  return text.replace(/\s/g, " ");
}

/** Рубли без копеек: «700 000 ₽». На вход — целые рубли (`number` точен до 9·10¹⁵). */
export function formatRubles(rubles: number): string {
  return normalizeSpaces(rublesFormat.format(rubles));
}

/** Копейки строкой → целые рубли числом, с отбрасыванием копеек. */
export function kopecksToWholeRubles(kopecks: string): number {
  return Number(BigInt(kopecks) / BigInt(100));
}

/** «Собрано 245 000 ₽ из 700 000 ₽ · 35%». */
export function goalSummaryText(goal: ActiveGoal): string {
  return `Собрано ${formatRubles(kopecksToWholeRubles(goal.collectedAmountKopecks))} из ${formatRubles(
    kopecksToWholeRubles(goal.targetAmountKopecks),
  )} · ${goal.percent}%`;
}

/** Плавное замедление к концу — та же кривая у полосы (CSS) и у счётчика (rAF). */
export function easeOutCubic(t: number): number {
  const clamped = Math.min(1, Math.max(0, t));

  return 1 - (1 - clamped) ** 3;
}
