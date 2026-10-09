/**
 * Время в админке — по Уфе, как на сайте (D-F04, `CAMPAIGN_TIME_ZONE`).
 *
 * Исключение — цели месяца: их даты API принимает и отдаёт по Москве
 * (`ГГГГ-ММ-ДД`, включительно, API.md §14). Там даты остаются строками
 * и не пересчитываются вовсе.
 *
 * В Уфе нет перехода на летнее время, смещение постоянно: +05:00. Поэтому
 * дату из `<input type="date">` можно перевести в момент UTC без таблиц
 * часовых поясов, строковой склейкой с `+05:00`.
 */

import { CAMPAIGN_TIME_ZONE } from "@/lib/format";

export const ADMIN_TIME_ZONE = CAMPAIGN_TIME_ZONE;

/** Смещение Уфы от UTC. */
const UFA_OFFSET = "+05:00";

const MS_IN_DAY = 24 * 60 * 60 * 1000;

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const dateTimeFormat = new Intl.DateTimeFormat("ru-RU", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: ADMIN_TIME_ZONE,
});

const dateFormat = new Intl.DateTimeFormat("ru-RU", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: ADMIN_TIME_ZONE,
});

/** «09.10.2026, 14:32» по Уфе. `null` — прочерк. */
export function formatDateTime(iso: string | null): string {
  return iso === null ? "—" : dateTimeFormat.format(new Date(iso));
}

/** «09.10.2026» по Уфе. */
export function formatDate(iso: string | null): string {
  return iso === null ? "—" : dateFormat.format(new Date(iso));
}

/**
 * Дата без времени (`ГГГГ-ММ-ДД`) как есть, без пересчёта поясов:
 * «2026-10-01» → «01.10.2026». Для целей месяца и дней графика.
 */
export function formatPlainDate(date: string): string {
  const [year, month, day] = date.split("-");

  return `${day}.${month}.${year}`;
}

/** Календарный день по Уфе, `ГГГГ-ММ-ДД`. */
export function ufaDayKey(time: number | Date): string {
  return new Date(time).toLocaleDateString("en-CA", { timeZone: ADMIN_TIME_ZONE });
}

/** Сегодня по Москве, `ГГГГ-ММ-ДД` — подсказка в форме цели месяца. */
export function moscowToday(now: number = Date.now()): string {
  return new Date(now).toLocaleDateString("en-CA", { timeZone: "Europe/Moscow" });
}

export function isPlainDate(value: string): boolean {
  return DATE_PATTERN.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

/** Начало дня по Уфе в UTC ISO: «2026-10-09» → «2026-10-08T19:00:00.000Z». */
export function ufaDayStartIso(date: string): string {
  return new Date(`${date}T00:00:00${UFA_OFFSET}`).toISOString();
}

/** Следующий день после даты, `ГГГГ-ММ-ДД` — для границы `to` (не включительно). */
export function nextDay(date: string): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + MS_IN_DAY).toISOString().slice(0, 10);
}

/** Сдвиг даты на n дней, `ГГГГ-ММ-ДД`. */
export function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * MS_IN_DAY).toISOString().slice(0, 10);
}

/** Дней в периоде включительно: «01.10–07.10» = 7. */
export function daysInclusive(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / MS_IN_DAY) + 1;
}

/**
 * Период по датам Уфы (оба конца включительно) → `from`/`to` для API, где
 * `to` не включительно. Пустая граница — не отправляется.
 */
export function ufaRangeToIso(from: string, to: string): { from?: string; to?: string } {
  return {
    ...(isPlainDate(from) ? { from: ufaDayStartIso(from) } : {}),
    ...(isPlainDate(to) ? { to: ufaDayStartIso(nextDay(to)) } : {}),
  };
}

/** Значение для `<input type="datetime-local">` по Уфе: «2026-10-09T14:32». */
export function toUfaDateTimeInput(time: number | Date): string {
  const shifted = new Date(new Date(time).getTime() + 5 * 60 * 60 * 1000);

  return shifted.toISOString().slice(0, 16);
}

/** Обратно: «2026-10-09T14:32» (Уфа) → ISO UTC. `null` — поле пустое или битое. */
export function ufaDateTimeInputToIso(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) {
    return null;
  }

  const time = Date.parse(`${value}:00${UFA_OFFSET}`);

  return Number.isNaN(time) ? null : new Date(time).toISOString();
}

/** Все дни от `from` до `to` включительно, `ГГГГ-ММ-ДД`. */
export function daysBetween(from: string, to: string): string[] {
  const days: string[] = [];

  for (let day = from; day <= to; day = nextDay(day)) {
    days.push(day);
  }

  return days;
}
