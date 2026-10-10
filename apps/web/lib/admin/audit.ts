/**
 * Журнал действий (API.md §6): фильтры → query и «было → стало» по полям.
 * ПДн сервер уже заменил на `"[скрыто]"` — показываем как есть.
 */

import { formatKopecks } from "./money";
import type { QueryValue } from "./query";
import { ufaRangeToIso } from "./time";

export interface AuditFilters {
  /** Даты по Уфе, включительно. */
  readonly from: string;
  readonly to: string;
  readonly actorId: string;
  /** `donation.*` или точное действие. */
  readonly action: string;
  readonly entityType: string;
}

export const EMPTY_AUDIT_FILTERS: AuditFilters = { from: "", to: "", actorId: "", action: "", entityType: "" };

export function auditFiltersToParams(filters: AuditFilters): Readonly<Record<string, QueryValue>> {
  return {
    ...ufaRangeToIso(filters.from, filters.to),
    actorId: filters.actorId,
    action: filters.action,
    entityType: filters.entityType,
  };
}

const MONEY_KEY = /kopecks$/i;
const ISO_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

/** Значение поля для человека: деньги — в рублях, null — «пусто». */
export function formatAuditValue(key: string, value: unknown): string {
  if (value === null || value === undefined) {
    return "пусто";
  }

  if (typeof value === "string" && MONEY_KEY.test(key) && /^-?\d+$/.test(value)) {
    return formatKopecks(value);
  }

  if (typeof value === "boolean") {
    return value ? "да" : "нет";
  }

  if (typeof value === "string") {
    return ISO_TIME.test(value) ? new Date(value).toLocaleString("ru-RU", { timeZone: "Asia/Yekaterinburg" }) : value;
  }

  return JSON.stringify(value);
}

export interface DiffRow {
  readonly field: string;
  readonly before: string | null;
  readonly after: string | null;
}

/** Объединение полей «до» и «после»; у создания нет «до», у удаления — «после». */
export function auditDiff(
  before: Readonly<Record<string, unknown>> | null,
  after: Readonly<Record<string, unknown>> | null,
): DiffRow[] {
  const fields = [...new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])];

  return fields.map((field) => ({
    field,
    before: before === null ? null : formatAuditValue(field, before[field]),
    after: after === null ? null : formatAuditValue(field, after[field]),
  }));
}
