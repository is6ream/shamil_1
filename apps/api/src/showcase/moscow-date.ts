import { MOSCOW_TIME_ZONE, MOSCOW_UTC_OFFSET_MS } from './showcase.constants';

/** Сутки в миллисекундах — для границ дня. */
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Сегодняшняя дата по Москве в том виде, в каком Prisma хранит колонку `date`:
 * полночь UTC этого календарного дня.
 *
 * Считать по UTC нельзя: с 00:00 до 03:00 МСК первого числа UTC ещё живёт
 * в прошлом месяце, и главная показала бы чужую цель месяца — хотя триггер
 * уже раскладывает донаты в новый.
 */
export function moscowToday(now: Date = new Date()): Date {
  const [year, month, day] = new Intl.DateTimeFormat('en-CA', {
    timeZone: MOSCOW_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
    .format(now)
    .split('-')
    .map(Number) as [number, number, number];

  return new Date(Date.UTC(year, month - 1, day));
}

/** Начало календарного дня `date` (колонка `date`) по Москве, как момент времени. */
export function moscowDayStart(date: Date): Date {
  return new Date(date.getTime() - MOSCOW_UTC_OFFSET_MS);
}

/**
 * Последняя миллисекунда календарного дня `date` по Москве.
 * Период цели месяца включает свой последний день целиком: донат в 23:59 МСК
 * тридцатого числа триггер кладёт в сентябрь.
 */
export function moscowDayEnd(date: Date): Date {
  return new Date(date.getTime() + DAY_MS - MOSCOW_UTC_OFFSET_MS - 1);
}
