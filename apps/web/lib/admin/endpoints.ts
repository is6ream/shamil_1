/**
 * Маршруты API админки и разбор их ответов.
 *
 * Сверено с `docs/admin/API.md` 09.10.2026 (D-F01 закрыт): login/refresh
 * отдают `{ accessToken, tokenType, expiresIn, user }`, смена пароля — `PATCH`
 * и тоже отдаёт новую сессию. Префикс `/api` уже в `API_URL`. Все пути
 * держим здесь, типы ответов — в `types.ts`.
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

const id = (value: string) => encodeURIComponent(value);

/**
 * Маршруты разделов админки — сверены с `docs/admin/API.md` 09.10.2026.
 * Все пути от `/api` (префикс уже в `API_URL`).
 */
export const ADMIN_PATHS = {
  users: "/admin/users",
  user: (userId: string) => `/admin/users/${id(userId)}`,
  userResetPassword: (userId: string) => `/admin/users/${id(userId)}/reset-password`,

  audit: "/admin/audit",

  media: "/admin/media",
  mediaItem: (mediaId: string) => `/admin/media/${id(mediaId)}`,

  gallery: "/admin/gallery",
  galleryItem: (itemId: string) => `/admin/gallery/${id(itemId)}`,
  galleryOrder: "/admin/gallery/order",

  videos: "/admin/videos",
  video: (videoId: string) => `/admin/videos/${id(videoId)}`,
  videosOrder: "/admin/videos/order",

  content: "/admin/content",
  contentBlock: (key: string) => `/admin/content/${id(key)}`,

  stages: "/admin/stages",
  stage: (stageId: string) => `/admin/stages/${id(stageId)}`,
  stagesOrder: "/admin/stages/order",

  news: "/admin/news",
  newsPost: (postId: string) => `/admin/news/${id(postId)}`,

  donations: "/admin/donations",
  donation: (donationId: string) => `/admin/donations/${id(donationId)}`,
  donationConfirm: (donationId: string) => `/admin/donations/${id(donationId)}/confirm`,
  donationsExport: "/admin/donations/export.csv",
  manualDonation: "/admin/donations/manual",

  campaign: "/admin/campaign",
  monthlyGoals: "/admin/campaign/monthly-goals",
  monthlyGoal: (goalId: string) => `/admin/campaign/monthly-goals/${id(goalId)}`,

  dashboard: "/admin/dashboard",

  /** Публичный справочник — для фильтра и формы региона. */
  regions: "/regions",
} as const;

/** Лимиты из API.md — проверяются в формах до отправки. */
export const LIMITS = {
  /** §7: `MEDIA_MAX_UPLOAD_MB`. */
  uploadMaxBytes: 15 * 1024 * 1024,
  uploadTypes: ["image/jpeg", "image/png", "image/webp"],
  /** §13: потолок ручного поступления, 240 млн ₽. */
  manualMaxKopecks: "24000000000",
  /** §14: потолок общей цели, 10 млрд ₽. */
  goalMaxKopecks: "1000000000000",
  /** §11: смета и освоено этапа, 2,4 млрд ₽. */
  stageMaxKopecks: "240000000000",
  stagePhotos: 30,
  /** §15: период дашборда. */
  dashboardMaxDays: 366,
  pageSize: 25,
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
