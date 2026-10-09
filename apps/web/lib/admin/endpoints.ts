/**
 * Маршруты API админки и разбор их ответов.
 *
 * Фронт пишется раньше контракта `docs/admin/API.md` (D-F01). Маршруты
 * авторизации сверены с кодом бэкенда (`apps/api/src/auth/auth.controller.ts`,
 * коммит B2): login/refresh отдают `SessionResponse` `{ accessToken, tokenType,
 * expiresIn, user }`, смена пароля — `PATCH` и тоже отдаёт новую сессию.
 * Префикс `/api` уже в `API_URL`. Всё, что о контракте известно, держим
 * здесь, чтобы сверка с API.md была правкой одного места.
 *
 * Ответы разбираются с проверкой формы: внешние данные не доверенные,
 * и тихий `undefined` в сессии хуже явной ошибки.
 */

import { AdminApiError } from "./errors";
import { isAdminRole } from "./roles";
import type { AdminRole } from "./roles";

export const AUTH_PATHS = {
  login: "/admin/auth/login",
  refresh: "/admin/auth/refresh",
  logout: "/admin/auth/logout",
  me: "/admin/auth/me",
  changePassword: "/admin/auth/password",
} as const;

/**
 * Политика пароля — зеркало `apps/api/src/auth/auth.constants.ts`.
 * Максимум в байтах UTF-8: bcrypt читает только первые 72 байта.
 */
export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_BYTES = 72;

export interface AdminUser {
  readonly id: string;
  readonly email: string;
  readonly role: AdminRole;
  readonly displayName: string | null;
}

export interface LoginBody {
  readonly email: string;
  readonly password: string;
}

export interface ChangePasswordBody {
  readonly currentPassword: string;
  readonly newPassword: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function malformed(what: string): AdminApiError {
  return new AdminApiError(502, [`Сервер вернул неожиданный ответ (${what}). Сообщите разработчику.`]);
}

/** `{ accessToken }` из ответа login/refresh. */
export function parseAccessToken(body: unknown): string {
  if (isRecord(body) && typeof body.accessToken === "string" && body.accessToken !== "") {
    return body.accessToken;
  }

  throw malformed("токен");
}

/** Пользователь из `/me`; допускает обёртку `{ user }` у ответа login. */
export function parseAdminUser(body: unknown): AdminUser {
  const source = isRecord(body) && isRecord(body.user) ? body.user : body;

  if (
    isRecord(source) &&
    typeof source.id === "string" &&
    typeof source.email === "string" &&
    isAdminRole(source.role)
  ) {
    return {
      id: source.id,
      email: source.email,
      role: source.role,
      displayName: typeof source.displayName === "string" ? source.displayName : null,
    };
  }

  throw malformed("пользователь");
}
