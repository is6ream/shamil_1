/**
 * Деньги сбора.
 *
 * Правило проекта (CONTEXT.md §7): суммы живут только целым числом копеек.
 * Из базы они приходят строками — там `BigInt`, а `JSON.stringify` на нём
 * бросает исключение (см. `apps/api/src/donations/dto/donation-response.dto.ts`).
 * Поэтому вход здесь — строка или целое число, и ни одной операции
 * с плавающей точкой над деньгами.
 */

import { GROUP_SEPARATOR, groupDigits } from "@/lib/format";
import { MIN_DONATION_RUBLES } from "@/lib/site";

/** Сколько копеек в рубле. Дублирует `KOPECKS_IN_RUBLE` бэкенда. */
const KOPECKS_IN_RUBLE = 100n;

/*
 * Группировку разрядов и разделитель берём из lib/format.ts — они общие
 * с счётчиками платежей. Своя реализация вместо `Intl.NumberFormat`:
 * версия ICU в Node и в браузере может отличаться разделителем, и тогда
 * каждая сумма на странице даёт hydration mismatch.
 */

const RUBLE_SIGN = "₽";

/** Допустимая запись суммы в копейках, пришедшей строкой из API. */
const KOPECKS_PATTERN = /^-?\d+$/;

/** Что человек может набрать в поле суммы: «1 000 ₽», «1000», «100,50». */
const RUBLES_INPUT_PATTERN = /^\d+(?:[.,]\d{1,2})?$/;

/** Минимальная сумма в копейках — зеркало `MIN_DONATION_KOPECKS` бэкенда. */
export const MIN_DONATION_KOPECKS = MIN_DONATION_RUBLES * 100;

/**
 * Приводит сумму к `bigint`. Строки разбираются целиком, без `parseFloat`:
 * он молча съедает хвост («12abc» → 12), а на деньгах молчать нельзя.
 */
function toKopecks(value: string | number): bigint {
  if (typeof value === "number") {
    if (!Number.isInteger(value)) {
      throw new TypeError(`Сумма в копейках должна быть целой, получено: ${value}`);
    }

    return BigInt(value);
  }

  const trimmed = value.trim();

  if (!KOPECKS_PATTERN.test(trimmed)) {
    throw new TypeError(`Некорректная сумма в копейках: "${value}"`);
  }

  return BigInt(trimmed);
}

/**
 * Сумма для показа: «1 234 ₽».
 *
 * Копейки выводятся, только когда они не нулевые: у пожертвования по реквизитам
 * может быть некруглая сумма, а у пресетов — никогда, и «100,00 ₽» рядом
 * со слоганом про 100 ₽ читается как ценник в магазине.
 */
export function kopecksToRubDisplay(value: string | number): string {
  const kopecks = toKopecks(value);
  const isNegative = kopecks < 0n;
  const absolute = isNegative ? -kopecks : kopecks;

  const rubles = absolute / KOPECKS_IN_RUBLE;
  const remainder = absolute % KOPECKS_IN_RUBLE;

  const body =
    remainder === 0n
      ? groupDigits(rubles.toString())
      : `${groupDigits(rubles.toString())},${remainder.toString().padStart(2, "0")}`;

  return `${isNegative ? "−" : ""}${body}${GROUP_SEPARATOR}${RUBLE_SIGN}`;
}

/** Та же сумма без знака рубля — там, где знак стоит отдельным элементом. */
export function kopecksToRubNumberDisplay(value: string | number): string {
  return kopecksToRubDisplay(value).replace(`${GROUP_SEPARATOR}${RUBLE_SIGN}`, "");
}

/**
 * Рубли из формы → копейки для DTO.
 *
 * `Math.round` здесь обязателен: 100.1 * 100 в двоичной плавающей точке
 * даёт 10009.999999999998, и `@IsInt()` на бэкенде отклонит такое тело.
 */
export function rublesToKopecks(rubles: number): number {
  if (!Number.isFinite(rubles) || rubles < 0) {
    throw new TypeError(`Некорректная сумма в рублях: ${rubles}`);
  }

  return Math.round(rubles * 100);
}

/**
 * Разбор того, что человек набрал в поле суммы. `null` — «не число»,
 * а не ноль: ноль это осмысленная сумма, и путать их в валидации нельзя.
 * `\s` в регулярном выражении покрывает и неразрывный пробел.
 */
export function parseRublesInput(raw: string): number | null {
  const cleaned = raw.replace(/[\s₽]/g, "");

  if (cleaned === "" || !RUBLES_INPUT_PATTERN.test(cleaned)) {
    return null;
  }

  return Number(cleaned.replace(",", "."));
}

/**
 * Процент выполнения для шкалы. Возвращается как есть, без обрезки по 100:
 * перевыполнение месячной цели — сильный сигнал, а не ошибка данных
 * (kit.css, `.meter.done`). Ширину заливки обрезает уже компонент шкалы.
 */
export function percentOfGoal(collected: string | number, goal: string | number): number {
  const goalKopecks = toKopecks(goal);

  if (goalKopecks <= 0n) {
    return 0;
  }

  // Считаем в десятых долях процента целочисленно и делим один раз:
  // деление bigint отбрасывает дробь, и промежуточный множитель её сохраняет.
  const tenths = (toKopecks(collected) * 1000n) / goalKopecks;

  return Number(tenths) / 10;
}

/** Ширина заливки шкалы: процент, обрезанный по краям диапазона. */
export function clampPercent(percent: number): number {
  return Math.min(100, Math.max(0, percent));
}

/** Остаток до цели в копейках, строкой. Перевыполнение даёт «0». */
export function remainderToGoal(collected: string | number, goal: string | number): string {
  const left = toKopecks(goal) - toKopecks(collected);

  return (left > 0n ? left : 0n).toString();
}

/**
 * Сколько пожертвований по 100 ₽ осталось до цели.
 *
 * «17 000 человек по сотне» звучит достижимо, «1 700 000 ₽» — нет:
 * приём из прототипа (docs/design/prototype.html, блок цели).
 */
export function remainderInMinDonations(collected: string | number, goal: string | number): number {
  const left = BigInt(remainderToGoal(collected, goal));

  return Number(left / BigInt(MIN_DONATION_KOPECKS));
}
