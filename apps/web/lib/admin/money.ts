/**
 * Деньги в админке: рубли из формы ↔ строка копеек API.
 *
 * Только строковая и целочисленная арифметика: `parseFloat("1234.56") * 100`
 * даёт 123455.99999999999, и такое тело API отклонит, а округление
 * «на глаз» в деньгах недопустимо. API принимает и отдаёт копейки строкой
 * из цифр (API.md, вступление).
 *
 * Админка — только клиентская (D-05), поэтому для вывода годится
 * `Intl.NumberFormat`: расхождения ICU сервера и браузера здесь нет.
 */

/** Что человек может набрать: «1 234,56», «1234.5», «1 000 ₽», «0100». */
const RUBLES_PATTERN = /^(\d+)(?:[.,](\d{1,2}))?$/;

/** Копейки строкой, как в API. */
const KOPECKS_PATTERN = /^-?\d+$/;

const KOPECKS_IN_RUBLE = BigInt(100);

const rublesFormat = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 });

/**
 * Рубли из поля формы → копейки строкой (`"1234,56"` → `"123456"`).
 * `null` — не сумма: пусто, буквы, минус, больше двух знаков после запятой.
 * Пробелы разрядов (в том числе неразрывные) и знак ₽ допускаются.
 */
export function rublesToKopecks(raw: string): string | null {
  const cleaned = raw.replace(/[\s₽]/g, "");
  const match = RUBLES_PATTERN.exec(cleaned);

  if (match === null) {
    return null;
  }

  const [, whole, fraction = ""] = match;
  const kopecks = BigInt(whole) * KOPECKS_IN_RUBLE + BigInt(fraction.padEnd(2, "0"));

  return kopecks.toString();
}

/** Копейки → значение для поля формы: `"123456"` → `"1234,56"`, `"100000"` → `"1000"`. */
export function kopecksToRublesInput(kopecks: string | null): string {
  if (kopecks === null || !KOPECKS_PATTERN.test(kopecks)) {
    return "";
  }

  const value = BigInt(kopecks);
  const sign = value < BigInt(0) ? "-" : "";
  const absolute = value < BigInt(0) ? -value : value;
  const rubles = absolute / KOPECKS_IN_RUBLE;
  const rest = absolute % KOPECKS_IN_RUBLE;

  return rest === BigInt(0) ? `${sign}${rubles}` : `${sign}${rubles},${rest.toString().padStart(2, "0")}`;
}

/**
 * Копейки для показа: `"123456"` → «1 234,56 ₽», `"100000"` → «1 000 ₽».
 * Копейки выводятся, только когда они не нулевые. Неверная строка — «—»:
 * экран со списком не должен падать из-за одной битой суммы.
 */
export function formatKopecks(kopecks: string | null): string {
  if (kopecks === null || !KOPECKS_PATTERN.test(kopecks)) {
    return "—";
  }

  const value = BigInt(kopecks);
  const isNegative = value < BigInt(0);
  const absolute = isNegative ? -value : value;
  const rubles = rublesFormat.format(absolute / KOPECKS_IN_RUBLE);
  const rest = absolute % KOPECKS_IN_RUBLE;
  const body = rest === BigInt(0) ? rubles : `${rubles},${rest.toString().padStart(2, "0")}`;

  return `${isNegative ? "−" : ""}${body} ₽`;
}

/** Сравнение двух сумм копеек без потери точности. */
export function compareKopecks(a: string, b: string): number {
  const left = BigInt(a);
  const right = BigInt(b);

  if (left === right) {
    return 0;
  }

  return left < right ? -1 : 1;
}

/** Процент «собрано из цели» с одним знаком, целочисленно. Цель 0 — 0%. */
export function percentOf(collected: string, goal: string): number {
  const goalValue = BigInt(goal);

  if (goalValue <= BigInt(0)) {
    return 0;
  }

  return Number((BigInt(collected) * BigInt(1000)) / goalValue) / 10;
}

export interface KopecksLimits {
  /** Включительно; по умолчанию сумма должна быть больше нуля. */
  readonly min?: string;
  readonly max?: string;
  /** Подпись максимума для текста ошибки: «240 млн ₽». */
  readonly maxLabel?: string;
}

export type KopecksCheck =
  | { readonly ok: true; readonly kopecks: string }
  | { readonly ok: false; readonly error: string };

/** Разбор поля суммы с границами — общий текст ошибок для всех форм. */
export function checkRublesInput(raw: string, limits: KopecksLimits = {}): KopecksCheck {
  const kopecks = rublesToKopecks(raw);

  if (kopecks === null) {
    return { ok: false, error: "Введите сумму цифрами, например 1 500 или 1 500,50." };
  }

  const value = BigInt(kopecks);

  if (limits.min === undefined ? value <= BigInt(0) : value < BigInt(limits.min)) {
    return {
      ok: false,
      error: limits.min === undefined ? "Сумма должна быть больше нуля." : `Не меньше ${formatKopecks(limits.min)}.`,
    };
  }

  if (limits.max !== undefined && value > BigInt(limits.max)) {
    return { ok: false, error: `Не больше ${limits.maxLabel ?? formatKopecks(limits.max)}.` };
  }

  return { ok: true, kopecks };
}
