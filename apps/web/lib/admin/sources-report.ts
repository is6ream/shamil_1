/**
 * Отчёт «Пожертвования по источникам»: доля строки и выгрузка в CSV.
 * Без React — проверяется обычными функциями.
 *
 * CSV по правилам выгрузки донатов (`apps/api/src/admin/csv.ts`, D-08):
 * UTF-8 с BOM, `;`, CRLF, суммы с десятичной запятой. Метки пишут люди,
 * поэтому значение, похожее на формулу Excel, предваряется апострофом.
 */
import { sourceLabel } from "./attribution";
import type { DonationsBySource, SourceAggregate, SourceGrouping, SourceRow } from "./types";

const CSV_BOM = "﻿";
const CSV_SEPARATOR = ";";
const CSV_NEWLINE = "\r\n";
const FORMULA_START = /^[=+\-@\t\r]/;
const NO_VALUE = "";

/** Точность доли — десятые процента: 12,3 %. */
const SHARE_SCALE = 1000n;

/**
 * Доля суммы строки в сумме за период, в процентах с одним знаком.
 * Считается на BigInt: суммы — копейки строкой, double их округлил бы.
 */
export function shareOfTotal(partKopecks: string, totalKopecks: string): string {
  const total = BigInt(totalKopecks);

  if (total <= 0n) {
    return "0,0 %";
  }

  const tenths = (BigInt(partKopecks) * SHARE_SCALE + total / 2n) / total;

  return `${(tenths / 10n).toString()},${(tenths % 10n).toString()} %`;
}

function csvCell(value: string | number): string {
  const text = String(value);
  const safe = FORMULA_START.test(text) ? `'${text}` : text;

  return /[";\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

function csvRow(values: readonly (string | number)[]): string {
  return values.map(csvCell).join(CSV_SEPARATOR) + CSV_NEWLINE;
}

/** Копейки строкой → «1234,56». */
export function kopecksToCsvRubles(kopecks: string): string {
  const value = BigInt(kopecks);
  const sign = value < 0n ? "-" : "";
  const absolute = value < 0n ? -value : value;

  return `${sign}${(absolute / 100n).toString()},${(absolute % 100n).toString().padStart(2, "0")}`;
}

/** Колонки разреза: что, кроме источника, различает строки. */
export function dimensionsOf(groupBy: SourceGrouping): readonly ("medium" | "campaign" | "content")[] {
  switch (groupBy) {
    case "medium":
      return ["medium"];
    case "campaign":
      return ["campaign"];
    case "content":
      return ["campaign", "content"];
    default:
      return [];
  }
}

const DIMENSION_HEADERS = { medium: "Канал", campaign: "Кампания", content: "Объявление" } as const;

function aggregateCells(row: SourceAggregate, totalKopecks: string): (string | number)[] {
  return [
    row.count,
    kopecksToCsvRubles(row.totalKopecks),
    kopecksToCsvRubles(row.averageKopecks),
    shareOfTotal(row.totalKopecks, totalKopecks),
  ];
}

/** CSV отчёта в том виде, в каком он на экране: строки, «без атрибуции» и итог. */
export function sourcesReportCsv(data: DonationsBySource): string {
  const dimensions = dimensionsOf(data.groupBy);
  const sourceHeader = data.groupBy === "how_did_you_hear" ? "Откуда узнали" : "Источник";
  const header = [
    sourceHeader,
    ...dimensions.map((dimension) => DIMENSION_HEADERS[dimension]),
    "Пожертвований",
    "Сумма, ₽",
    "Средний чек, ₽",
    "Доля",
  ];
  const padding = dimensions.map(() => NO_VALUE);
  const total = data.total.totalKopecks;
  const rows = data.rows.map((row: SourceRow) => [
    sourceLabel(row.source, data.groupBy),
    ...dimensions.map((dimension) => row[dimension] ?? NO_VALUE),
    ...aggregateCells(row, total),
  ]);

  return (
    CSV_BOM +
    [
      header,
      ...rows,
      ["(без атрибуции)", ...padding, ...aggregateCells(data.unattributed, total)],
      ["Итого", ...padding, ...aggregateCells(data.total, total)],
    ]
      .map(csvRow)
      .join("")
  );
}

export function sourcesReportFileName(data: DonationsBySource): string {
  return `istochniki_${data.model}_${data.groupBy}_${data.period.from.slice(0, 10)}_${data.period.to.slice(0, 10)}.csv`;
}
