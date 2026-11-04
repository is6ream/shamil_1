/**
 * Кабинет жертвователя: флаг, маршруты API и страниц.
 *
 * Сверено с бэкендом 27.10.2026 (`apps/api/src/donor-*`). Префикс `/api`
 * уже в `API_URL`. Типы ответов — в `types.ts`.
 */

/**
 * Кабинет включён. Зеркало `DONOR_CABINET_ENABLED` бэкенда: выключенный
 * кабинет там — 404 на `/donor/*`, и кнопка входа на сайте ни к чему.
 * Публичная переменная: подставляется в бандл при сборке.
 */
export const DONOR_CABINET_ENABLED = process.env.NEXT_PUBLIC_DONOR_CABINET_ENABLED === "true";

export const DONOR_AUTH_PATHS = {
  methods: "/donor/auth/methods",
  requestCode: "/donor/auth/request-code",
  verify: "/donor/auth/verify",
  refresh: "/donor/auth/refresh",
  logout: "/donor/auth/logout",
  vkStart: "/donor/auth/vk/start",
  vkLink: "/donor/auth/vk/link",
} as const;

export const DONOR_PATHS = {
  me: "/donor/me",
  summary: "/donor/me/summary",
  emailRequestCode: "/donor/me/email/request-code",
  emailConfirm: "/donor/me/email/confirm",
  vk: "/donor/me/vk",
  deleteRequest: "/donor/me/delete/request",
  delete: "/donor/me/delete",
  donations: "/donor/donations",
  taxCertificates: "/donor/tax-certificates",
  regions: "/regions",
} as const;

/** Имя Web Lock refresh: своё, не админское — cookie у кабинетов разные. */
export const DONOR_REFRESH_LOCK = "shamil-donor-refresh";

/** Страницы кабинета. Пункты меню — в `components/donor/ProfileNav`. */
export const PROFILE_PATHS = {
  home: "/profile",
  settings: "/profile/settings",
} as const;

/** Цифр в коде из письма — зеркало `LOGIN_CODE_LENGTH` бэкенда. */
export const LOGIN_CODE_LENGTH = 6;

/** Повторная отправка кода — не чаще раза в минуту, как на бэкенде. */
export const CODE_RESEND_SECONDS = 60;
