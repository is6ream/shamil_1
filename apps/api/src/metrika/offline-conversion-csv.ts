/**
 * CSV офлайн-конверсий для Метрики. Чистые функции, без I/O.
 *
 * Формат по документации: обязательны `Target`, `DateTime` (Unix-время,
 * секунды, только прошлое) и хотя бы один идентификатор посетителя;
 * `Price` — десятичный разделитель точка, `Currency` — ISO 4217.
 * У загрузки один тип идентификатора на файл (`uploading.client_id_type`),
 * поэтому ClientId и Yclid выгружаются разными файлами.
 */

/** Колонка идентификатора и тип идентификатора загрузки в Метрике. */
export const IDENTIFIER_COLUMNS = {
  CLIENT_ID: 'ClientId',
  YCLID: 'Yclid',
} as const;

export type IdentifierType = keyof typeof IDENTIFIER_COLUMNS;

export interface ConversionRow {
  /** Значение идентификатора выбранного типа. */
  readonly identifier: string;
  readonly target: string;
  readonly conversionAt: Date;
  /** Сумма в рублях строкой с точкой: `"100.00"` (см. `kopecksToRubles`). */
  readonly price: string;
  readonly currency: string;
}

const LINE_BREAK = '\n';
const NEEDS_QUOTING = /[",\r\n]/;

/** Экранирование поля по RFC 4180: кавычки удваиваются, поле — в кавычках. */
export function escapeCsvField(value: string): string {
  return NEEDS_QUOTING.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** Unix-время в секундах — так `DateTime` ждёт Метрика. Миллисекунды отбрасываются. */
export function toUnixSeconds(date: Date): string {
  return Math.floor(date.getTime() / 1000).toString();
}

/**
 * Копейки → рубли строкой с точкой. Через BigInt, а не деление double:
 * 0.1 + 0.2 в цене цели — не то, что хочется сверять с выпиской.
 */
export function kopecksToRubles(kopecks: bigint): string {
  const sign = kopecks < 0n ? '-' : '';
  const absolute = kopecks < 0n ? -kopecks : kopecks;
  const rubles = absolute / 100n;
  const cents = (absolute % 100n).toString().padStart(2, '0');

  return `${sign}${rubles.toString()}.${cents}`;
}

/** Файл одной загрузки. Пустая пачка — `null`: пустой файл Метрика не примет. */
export function buildOfflineConversionsCsv(
  identifierType: IdentifierType,
  rows: readonly ConversionRow[],
): string | null {
  if (rows.length === 0) {
    return null;
  }

  const header = [IDENTIFIER_COLUMNS[identifierType], 'Target', 'DateTime', 'Price', 'Currency'];
  const lines = rows.map((row) =>
    [row.identifier, row.target, toUnixSeconds(row.conversionAt), row.price, row.currency]
      .map(escapeCsvField)
      .join(','),
  );

  return [header.join(','), ...lines].join(LINE_BREAK) + LINE_BREAK;
}
