/**
 * Календарь автосписаний — чистые функции без Nest и БД.
 *
 * Правило: n-е списание приходится на дату `якорь + n месяцев` в часовом поясе
 * жертвователя, в его `charge_time`. Если такого числа в месяце нет (подписка
 * от 31-го в феврале), дата прижимается к последнему дню месяца. Считается
 * всегда от якоря, а не от прошлого списания: иначе после февраля подписка
 * от 31-го навсегда съехала бы на 28-е.
 */

const MS_IN_MINUTE = 60_000;
const MS_IN_DAY = 24 * 60 * MS_IN_MINUTE;

/** Отказов подряд, после которых подписка становится FAILED. */
export const MAX_FAILED_CHARGES = 3;

/**
 * Через сколько повторять после n-го отказа подряд (n = 1, 2).
 * Третий отказ повтора не получает — подписка останавливается.
 */
export const RETRY_DELAYS_MS: readonly number[] = [1 * MS_IN_DAY, 3 * MS_IN_DAY];

const CHARGE_TIME_PATTERN = /^([01][0-9]|2[0-3]):([0-5][0-9])$/;

export class ChargeTimeFormatError extends Error {
  constructor(value: string) {
    super(`Время списания не в формате HH:mm: "${value}"`);
    this.name = 'ChargeTimeFormatError';
  }
}

interface LocalDate {
  readonly year: number;
  /** 0–11, как в Date. */
  readonly month: number;
  readonly day: number;
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

/** Дата + n месяцев с прижатием к концу месяца: 31.01 + 1 = 28.02 (29.02). */
export function addMonthsClamped(date: LocalDate, months: number): LocalDate {
  const total = date.year * 12 + date.month + months;
  const year = Math.floor(total / 12);
  const month = total - year * 12;

  return { year, month, day: Math.min(date.day, daysInMonth(year, month)) };
}

/** Смещение зоны от UTC в этот момент, мс. Через Intl — без библиотек часовых поясов. */
function zoneOffsetMs(instant: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(instant));
  const read = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((part) => part.type === type)?.value ?? '0');
  const asUtc = Date.UTC(read('year'), read('month') - 1, read('day'), read('hour'), read('minute'), read('second'));

  return asUtc - Math.floor(instant / 1000) * 1000;
}

/** Локальная дата момента в зоне — для якоря подписки. */
export function localDateOf(instant: Date, timeZone: string): LocalDate {
  const shifted = new Date(instant.getTime() + zoneOffsetMs(instant.getTime(), timeZone));

  return { year: shifted.getUTCFullYear(), month: shifted.getUTCMonth(), day: shifted.getUTCDate() };
}

/** `@db.Date` в Prisma — полночь UTC этой даты. */
export function toDbDate(date: LocalDate): Date {
  return new Date(Date.UTC(date.year, date.month, date.day));
}

export function fromDbDate(value: Date): LocalDate {
  return { year: value.getUTCFullYear(), month: value.getUTCMonth(), day: value.getUTCDate() };
}

function parseChargeTime(value: string): { hours: number; minutes: number } {
  const match = CHARGE_TIME_PATTERN.exec(value);

  if (match === null) {
    throw new ChargeTimeFormatError(value);
  }

  return { hours: Number(match[1]), minutes: Number(match[2]) };
}

/** Локальные дата и время в зоне → момент UTC. Вторая итерация — на случай перехода на летнее время. */
function zonedToInstant(date: LocalDate, hours: number, minutes: number, timeZone: string): Date {
  const wallClock = Date.UTC(date.year, date.month, date.day, hours, minutes);
  let instant = wallClock - zoneOffsetMs(wallClock, timeZone);

  instant = wallClock - zoneOffsetMs(instant, timeZone);

  return new Date(instant);
}

export interface ChargeScheduleInput {
  /** Локальная дата первого платежа (`billing_anchor_date`). */
  readonly anchorDate: Date;
  /** Номер цикла: 1 — через месяц после первого платежа. */
  readonly cycleNo: number;
  readonly chargeTime: string;
  readonly timeZone: string;
}

/** Плановый момент списания цикла `cycleNo`. */
export function chargeMoment(input: ChargeScheduleInput): Date {
  const { hours, minutes } = parseChargeTime(input.chargeTime);
  const date = addMonthsClamped(fromDbDate(input.anchorDate), input.cycleNo);

  return zonedToInstant(date, hours, minutes, input.timeZone);
}

/**
 * Первый цикл, плановый момент которого ещё впереди. Нужен при возобновлении
 * после паузы: пропущенные месяцы задним числом не списываем.
 */
export function nextCycleAfter(input: Omit<ChargeScheduleInput, 'cycleNo'> & { readonly fromCycle: number }, now: Date): number {
  let cycleNo = Math.max(1, input.fromCycle);

  while (chargeMoment({ ...input, cycleNo }).getTime() <= now.getTime()) {
    cycleNo += 1;
  }

  return cycleNo;
}

/**
 * Когда повторить после отказа. `null` — повторов больше нет, подписка
 * становится FAILED. `failCount` — отказов подряд с учётом текущего.
 */
export function retryAt(failCount: number, now: Date): Date | null {
  if (failCount >= MAX_FAILED_CHARGES) {
    return null;
  }

  const delay = RETRY_DELAYS_MS[failCount - 1];

  return delay === undefined ? null : new Date(now.getTime() + delay);
}
