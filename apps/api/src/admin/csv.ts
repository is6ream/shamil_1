/**
 * CSV для русского Excel (D-08): UTF-8 с BOM, разделитель `;`, перевод строки CRLF.
 * Без BOM Excel открывает файл в cp1251 и кириллица превращается в кракозябры.
 */

export const CSV_BOM = '﻿';
export const CSV_SEPARATOR = ';';
export const CSV_NEWLINE = '\r\n';

/**
 * Защита от CSV-инъекции: значение, которое Excel принял бы за формулу
 * (`=`, `+`, `-`, `@`, табуляция, CR), предваряется апострофом. Подпись
 * донатера и комментарий пишут люди — `=HYPERLINK(...)` из формы не должен
 * стать ссылкой в таблице бухгалтера.
 */
const FORMULA_START = /^[=+\-@\t\r]/;

export function csvCell(value: string | number | null): string {
  if (value === null) {
    return '';
  }

  const text = typeof value === 'number' ? String(value) : value;
  const safe = FORMULA_START.test(text) ? `'${text}` : text;

  return /[";\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function csvRow(values: readonly (string | number | null)[]): string {
  return values.map(csvCell).join(CSV_SEPARATOR) + CSV_NEWLINE;
}

/** Копейки → «1234,56»: десятичная запятая, как в русском Excel. */
export function kopecksToRubles(value: bigint | null): string | null {
  if (value === null) {
    return null;
  }

  const sign = value < 0n ? '-' : '';
  const absolute = value < 0n ? -value : value;
  const rubles = absolute / 100n;
  const kopecks = (absolute % 100n).toString().padStart(2, '0');

  return `${sign}${rubles},${kopecks}`;
}

/** Часовой пояс выгрузки — Уфа, как в админке и на сайте (D-F04). */
export const EXPORT_TIME_ZONE = 'Asia/Yekaterinburg';

const EXPORT_DATE_FORMAT = new Intl.DateTimeFormat('sv-SE', {
  timeZone: EXPORT_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

/** `2026-10-08 15:04:05` по Уфе — так Excel распознаёт дату-время. */
export function formatExportDate(value: Date | null): string | null {
  return value === null ? null : EXPORT_DATE_FORMAT.format(value);
}
