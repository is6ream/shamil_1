import { KOPECKS_IN_RUBLE, MIN_DONATION_KOPECKS } from '../../config/constants';

/** Слаг единственного сбора MVP. По нему сиды идемпотентны. */
export const CAMPAIGN_SLUG = 'shamil';

export const CAMPAIGN_SEED = {
  slug: CAMPAIGN_SLUG,
  title: 'Мечеть «Шамиль» в Уфе',
  /**
   * 240 000 000 ₽ из ТЗ, в копейках.
   * Валюта цели у заказчика ещё не подтверждена (вопрос 1 ТЗ) — учёт ведётся
   * в рублях, потому что в рублях назван минимальный донат и слоган про 100 ₽.
   */
  goalKopecks: BigInt(240_000_000) * BigInt(KOPECKS_IN_RUBLE),
  currency: 'RUB',
  minDonationKopecks: BigInt(MIN_DONATION_KOPECKS),
} as const;

/**
 * ЗАГЛУШКА. Цель на месяц и её период заказчик пока не назвал — это открытый
 * вопрос из CLAUDE.md. Без какого-то значения верхняя шкала прогресс-бара
 * не собирается вообще, поэтому ставим 5 000 000 ₽ на текущий месяц.
 * Правится админским эндпоинтом дня 9; повторный запуск сидов уже
 * выставленную цель не перетирает.
 */
export const MONTHLY_GOAL_PLACEHOLDER_KOPECKS = BigInt(5_000_000) * BigInt(KOPECKS_IN_RUBLE);

export interface MonthPeriod {
  readonly start: Date;
  readonly end: Date;
}

/**
 * Границы текущего месяца по московскому времени — той же зоне, в которой
 * триггер `donation_stats_apply` решает, в какой месяц попал донат.
 * Даты собираются в UTC: колонки в БД — `date`, времени в них нет.
 */
export function currentMonthPeriod(now: Date = new Date()): MonthPeriod {
  const moscowDate = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Moscow',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);

  const [year, month] = moscowDate.split('-').map(Number) as [number, number, number];

  return {
    start: new Date(Date.UTC(year, month - 1, 1)),
    // Нулевой день следующего месяца — последний день текущего.
    end: new Date(Date.UTC(year, month, 0)),
  };
}
