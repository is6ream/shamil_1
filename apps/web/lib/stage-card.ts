/**
 * Цифры плашки «Текущий этап» на первом экране: что крупно справа,
 * что мелко под ним, на сколько залита шкала.
 *
 * Отдельно от компонента, чтобы тестироваться без браузера. Считаем из
 * копеек (BigInt), а не из `percent` ответа API: там целое, а плашке
 * нужен один знак после запятой. Логику сумм это не трогает — только показ.
 */

import { formatRubles, kopecksToWholeRubles } from "./goal-progress";
import type { ActiveGoal } from "./goal-progress";

export type StageState = "empty" | "progress" | "reached";

export interface StageFigures {
  readonly state: StageState;
  /** Крупно справа: «32 300 ₽», «Станьте первым», «Собрано!». */
  readonly headline: string;
  /** Под ним: «из 750 000 ₽ · 4,3%». */
  readonly subline: string;
  /** Доля шкалы, 0–1. */
  readonly ratio: number;
  /** Для `aria-valuenow`: проценты с одним знаком, 0–100. */
  readonly percentValue: number;
}

const TENTHS_IN_WHOLE = BigInt(1000);
const RATIO_PRECISION = 10_000;
/** Неразрывный пробел: «из» и «·» не отрываются от суммы при переносе. */
const NBSP = "\u00A0";

const percentFormat = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 });

/**
 * Десятые доли процента, округлённые вниз: 4,39% → 43.
 * Пока цель не собрана, больше 999 не бывает — 100% не покажем раньше времени.
 */
export function stagePercentTenths(collectedKopecks: string, targetKopecks: string): number {
  const collected = BigInt(collectedKopecks);
  const target = BigInt(targetKopecks);

  if (target <= BigInt(0)) {
    return 0;
  }

  if (collected >= target) {
    return 1000;
  }

  return Number((collected * TENTHS_IN_WHOLE) / target);
}

/** 43 → «4,3%», 40 → «4%», 1000 → «100%». Меньше десятой при ненулевой сумме — «менее 0,1%». */
export function formatStagePercent(tenths: number, hasCollected: boolean): string {
  if (tenths === 0 && hasCollected) {
    return "менее 0,1%";
  }

  return `${percentFormat.format(tenths / 10)}%`;
}

/** Доля шкалы, 0–1, без округления вверх. */
export function stageFillRatio(collectedKopecks: string, targetKopecks: string): number {
  const collected = BigInt(collectedKopecks);
  const target = BigInt(targetKopecks);

  if (target <= BigInt(0) || collected <= BigInt(0)) {
    return 0;
  }

  if (collected >= target) {
    return 1;
  }

  return Number((collected * BigInt(RATIO_PRECISION)) / target) / RATIO_PRECISION;
}

export function stageFigures(goal: ActiveGoal): StageFigures {
  const collected = BigInt(goal.collectedAmountKopecks);
  const target = BigInt(goal.targetAmountKopecks);
  const ofTarget = `из${NBSP}${formatRubles(kopecksToWholeRubles(goal.targetAmountKopecks))}`;

  if (goal.isReached || collected >= target) {
    return {
      state: "reached",
      headline: "Собрано!",
      subline: `${formatRubles(kopecksToWholeRubles(goal.collectedAmountKopecks))} ${ofTarget}`,
      ratio: 1,
      percentValue: 100,
    };
  }

  if (collected === BigInt(0)) {
    return { state: "empty", headline: "Станьте первым", subline: `${ofTarget}${NBSP}· сбор открыт`, ratio: 0, percentValue: 0 };
  }

  const tenths = stagePercentTenths(goal.collectedAmountKopecks, goal.targetAmountKopecks);

  return {
    state: "progress",
    headline: formatRubles(kopecksToWholeRubles(goal.collectedAmountKopecks)),
    subline: `${ofTarget}${NBSP}· ${formatStagePercent(tenths, true)}`,
    ratio: stageFillRatio(goal.collectedAmountKopecks, goal.targetAmountKopecks),
    percentValue: tenths / 10,
  };
}
