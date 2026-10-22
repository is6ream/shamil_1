/**
 * Пресеты периода и «чипсы» активных фильтров списка пожертвований.
 *
 * Пресеты — те же даты по Уфе (`ГГГГ-ММ-ДД`, оба конца включительно), что
 * вводятся вручную: API о пресетах не знает, в адрес уходят обычные `from/to`.
 */

import type { DonationFilters } from "./donations";
import { DONATION_STATUS_LABELS, methodLabel, providerLabel } from "./labels";
import { formatKopecks, rublesToKopecks } from "./money";
import { addDays, formatPlainDate, ufaDayKey } from "./time";

export const PERIOD_PRESETS = [
  { key: "today", label: "Сегодня" },
  { key: "week", label: "7 дней" },
  { key: "month", label: "Этот месяц" },
  { key: "lastMonth", label: "Прошлый месяц" },
  { key: "year", label: "Этот год" },
] as const;

export type PeriodPreset = (typeof PERIOD_PRESETS)[number]["key"];

export interface PlainRange {
  readonly from: string;
  readonly to: string;
}

/** Последний день месяца `ГГГГ-ММ`: день перед первым числом следующего. */
function monthEnd(year: number, month: number): string {
  const next = month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, "0")}-01`;

  return addDays(next, -1);
}

export function presetRange(preset: PeriodPreset, now: number = Date.now()): PlainRange {
  const today = ufaDayKey(now);
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));

  switch (preset) {
    case "today":
      return { from: today, to: today };
    case "week":
      return { from: addDays(today, -6), to: today };
    case "month":
      return { from: `${today.slice(0, 7)}-01`, to: today };
    case "lastMonth": {
      const lastYear = month === 1 ? year - 1 : year;
      const last = month === 1 ? 12 : month - 1;

      return { from: `${lastYear}-${String(last).padStart(2, "0")}-01`, to: monthEnd(lastYear, last) };
    }
    case "year":
      return { from: `${year}-01-01`, to: today };
  }
}

/** Какой пресет выбран: `custom` — даты свои, `null` — периода нет. */
export function activePreset(range: PlainRange, now: number = Date.now()): PeriodPreset | "custom" | null {
  if (range.from === "" && range.to === "") {
    return null;
  }

  const match = PERIOD_PRESETS.find(({ key }) => {
    const preset = presetRange(key, now);

    return preset.from === range.from && preset.to === range.to;
  });

  return match?.key ?? "custom";
}

/** Плашка снимает один фильтр; период и сумма — по паре полей сразу. */
export type ChipKey =
  | "q"
  | "status"
  | "period"
  | "method"
  | "provider"
  | "amount"
  | "regionSlug"
  | "utmSource"
  | "utmMedium"
  | "utmCampaign";

export interface FilterChip {
  readonly key: ChipKey;
  readonly label: string;
}

function periodLabel(filters: DonationFilters): string {
  const prefix = filters.dateField === "paid" ? "Оплачены " : "";
  const from = filters.from === "" ? "" : formatPlainDate(filters.from);
  const to = filters.to === "" ? "" : formatPlainDate(filters.to);

  if (from !== "" && to !== "") {
    return `${prefix}${from} – ${to}`;
  }

  const bound = from !== "" ? `с ${from}` : `по ${to}`;
  const text = `${prefix}${bound}`;

  return text.charAt(0).toUpperCase() + text.slice(1);
}

function amountLabel(filters: DonationFilters): string {
  const money = (rubles: string) => formatKopecks(rublesToKopecks(rubles));
  const parts = [
    filters.minRubles === "" ? "" : `от ${money(filters.minRubles)}`,
    filters.maxRubles === "" ? "" : `до ${money(filters.maxRubles)}`,
  ].filter((part) => part !== "");
  const text = parts.join(" ");

  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Активные фильтры по порядку формы. Сортировка — не фильтр, её нет. */
export function filterChips(
  filters: DonationFilters,
  regionName: (slug: string) => string | null,
): FilterChip[] {
  const q = filters.q.trim();
  const chips: (FilterChip | null)[] = [
    q === "" ? null : { key: "q", label: `Поиск: «${q}»` },
    filters.status === "" ? null : { key: "status", label: DONATION_STATUS_LABELS[filters.status] },
    filters.from === "" && filters.to === "" ? null : { key: "period", label: periodLabel(filters) },
    filters.method === "" ? null : { key: "method", label: methodLabel(filters.method) },
    filters.provider === "" ? null : { key: "provider", label: providerLabel(filters.provider) },
    filters.minRubles === "" && filters.maxRubles === "" ? null : { key: "amount", label: amountLabel(filters) },
    filters.regionSlug === ""
      ? null
      : { key: "regionSlug", label: `Регион: ${regionName(filters.regionSlug) ?? filters.regionSlug}` },
    filters.utmSource === "" ? null : { key: "utmSource", label: `utm_source: ${filters.utmSource}` },
    filters.utmMedium === "" ? null : { key: "utmMedium", label: `utm_medium: ${filters.utmMedium}` },
    filters.utmCampaign === "" ? null : { key: "utmCampaign", label: `utm_campaign: ${filters.utmCampaign}` },
  ];

  return chips.filter((chip): chip is FilterChip => chip !== null);
}

export function clearChip(filters: DonationFilters, key: ChipKey): DonationFilters {
  switch (key) {
    case "period":
      return { ...filters, from: "", to: "", dateField: "created" };
    case "amount":
      return { ...filters, minRubles: "", maxRubles: "" };
    default:
      return { ...filters, [key]: "" };
  }
}
