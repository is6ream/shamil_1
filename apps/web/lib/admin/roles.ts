/**
 * Роли и права админки — зеркало таблицы D-06 (docs/admin/DECISIONS.md).
 *
 * Только для интерфейса: скрыть пункт меню или кнопку, которые всё равно
 * ответят 403. Защита живёт на API, здесь ничего не считается защищённым.
 */

export const ADMIN_ROLES = ["SUPER_ADMIN", "EDITOR", "ACCOUNTANT"] as const;

export type AdminRole = (typeof ADMIN_ROLES)[number];

export type AdminPermission =
  | "content"
  /** Реквизиты счёта — только суперадмин (D-17). */
  | "requisites"
  | "goals"
  | "manualDonations"
  | "donations"
  | "donorPersonalData"
  | "exportCsv"
  | "audit"
  | "users";

const PERMISSIONS: Readonly<Record<AdminRole, ReadonlySet<AdminPermission>>> = {
  SUPER_ADMIN: new Set<AdminPermission>([
    "content",
    "requisites",
    "goals",
    "manualDonations",
    "donations",
    "donorPersonalData",
    "exportCsv",
    "audit",
    "users",
  ]),
  EDITOR: new Set<AdminPermission>(["content", "goals", "manualDonations", "donations"]),
  ACCOUNTANT: new Set<AdminPermission>([
    "manualDonations",
    "donations",
    "donorPersonalData",
    "exportCsv",
    "audit",
  ]),
};

export const ROLE_LABELS: Readonly<Record<AdminRole, string>> = {
  SUPER_ADMIN: "Суперадмин",
  EDITOR: "Редактор",
  ACCOUNTANT: "Бухгалтер",
};

export function isAdminRole(value: unknown): value is AdminRole {
  return typeof value === "string" && (ADMIN_ROLES as readonly string[]).includes(value);
}

export function can(role: AdminRole, permission: AdminPermission): boolean {
  return PERMISSIONS[role].has(permission);
}
