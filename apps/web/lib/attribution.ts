/**
 * Атрибуция first-touch: UTM-метки, внешний Referer и страница первого захода.
 *
 * Сохраняется один раз — при первом визите — в cookie на 30 дней и уходит
 * в `POST /donations` полем `utm`. Повторные заходы метки не перезаписывают:
 * считаем, откуда человек узнал о сборе, а не с какой ссылки вернулся.
 *
 * Метка не имеет права сорвать донат. Поэтому всё, что бэкенд отклонил бы
 * (длина, символы), отбрасывается здесь же, а не уходит на сервер.
 * Правила — зеркало `apps/api/src/donations/dto/donation-utm.dto.ts`.
 *
 * Модуль чистый, кроме двух функций с `document`: их вызывают только
 * клиентские компоненты.
 */

import type { DonationUtm } from "@/lib/api/types";

export const ATTRIBUTION_COOKIE = "shamil_ft";

/** 30 дней — окно атрибуции. */
export const ATTRIBUTION_MAX_AGE_S = 30 * 24 * 60 * 60;

const UTM_VALUE_MAX_LENGTH = 128;
const URL_MAX_LENGTH = 512;
const UTM_VALUE_PATTERN = /^[\p{L}\p{N} _\-.~+%:@/|]+$/u;
const LANDING_PAGE_PATTERN = /^\/[^\s<>"']*$/;

/** Параметр URL → поле тела. */
const UTM_PARAMS = [
  ["utm_source", "source"],
  ["utm_medium", "medium"],
  ["utm_campaign", "campaign"],
  ["utm_content", "content"],
  ["utm_term", "term"],
] as const;

type MutableUtm = { -readonly [K in keyof DonationUtm]: DonationUtm[K] };

function cleanUtmValue(raw: string | null): string | undefined {
  const value = raw?.trim();

  if (value === undefined || value === "" || value.length > UTM_VALUE_MAX_LENGTH) {
    return undefined;
  }

  return UTM_VALUE_PATTERN.test(value) ? value : undefined;
}

/** Referer — только внешний и только http(s): свой домен атрибуцией не является. */
function cleanReferrer(raw: string, ownOrigin: string): string | undefined {
  if (raw === "" || raw.length > URL_MAX_LENGTH) {
    return undefined;
  }

  try {
    const url = new URL(raw);

    if ((url.protocol !== "http:" && url.protocol !== "https:") || url.origin === ownOrigin) {
      return undefined;
    }

    return raw;
  } catch {
    // Битый Referer — не повод терять остальные метки.
    return undefined;
  }
}

function cleanLandingPage(pathWithQuery: string): string | undefined {
  if (pathWithQuery.length > URL_MAX_LENGTH) {
    return undefined;
  }

  return LANDING_PAGE_PATTERN.test(pathWithQuery) ? pathWithQuery : undefined;
}

export interface LandingContext {
  /** `location.search`, с `?` или без. */
  readonly search: string;
  /** `location.pathname`. */
  readonly pathname: string;
  /** `document.referrer`. */
  readonly referrer: string;
  /** `location.origin` — чтобы не считать свой домен источником. */
  readonly origin: string;
}

/** Атрибуция первого захода из адреса страницы и Referer. */
export function buildAttribution(context: LandingContext): DonationUtm {
  const params = new URLSearchParams(context.search);
  const utm: MutableUtm = {};

  for (const [param, field] of UTM_PARAMS) {
    const value = cleanUtmValue(params.get(param));

    if (value !== undefined) {
      utm[field] = value;
    }
  }

  const referrer = cleanReferrer(context.referrer, context.origin);

  if (referrer !== undefined) {
    utm.referrer = referrer;
  }

  const query = params.toString();
  const landingPage = cleanLandingPage(query === "" ? context.pathname : `${context.pathname}?${query}`);

  if (landingPage !== undefined) {
    utm.landingPage = landingPage;
  }

  return utm;
}

const ALLOWED_KEYS = new Set<string>([
  ...UTM_PARAMS.map(([, field]) => field),
  "referrer",
  "landingPage",
]);

/**
 * Разбор cookie. Значение могли подменить руками, поэтому каждое поле
 * проверяется заново, а не принимается на веру.
 */
export function parseAttributionCookie(cookieHeader: string): DonationUtm | null {
  const entry = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${ATTRIBUTION_COOKIE}=`));

  if (entry === undefined) {
    return null;
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(decodeURIComponent(entry.slice(ATTRIBUTION_COOKIE.length + 1)));
  } catch {
    // Испорченная cookie — атрибуции нет, донат идёт без неё.
    return null;
  }

  if (typeof parsed !== "object" || parsed === null) {
    return null;
  }

  const utm: MutableUtm = {};

  for (const [key, value] of Object.entries(parsed)) {
    if (!ALLOWED_KEYS.has(key) || typeof value !== "string") {
      continue;
    }

    const clean =
      key === "referrer"
        ? cleanReferrer(value, "")
        : key === "landingPage"
          ? cleanLandingPage(value)
          : cleanUtmValue(value);

    if (clean !== undefined) {
      utm[key as keyof MutableUtm] = clean;
    }
  }

  return utm;
}

/** Есть ли что отправлять: пустой объект в теле — шум. */
export function hasAttribution(utm: DonationUtm | null): utm is DonationUtm {
  return utm !== null && Object.keys(utm).length > 0;
}

/** Атрибуция из cookie браузера. Только на клиенте. */
export function readStoredAttribution(): DonationUtm | null {
  return parseAttributionCookie(document.cookie);
}

/**
 * Запись при первом визите. Уже есть cookie — ничего не делаем: first-touch.
 * `SameSite=Lax` — cookie живёт и после перехода по ссылке из мессенджера.
 */
export function captureFirstTouch(): void {
  // Вход в админку — не визит жертвователя.
  if (window.location.pathname.startsWith("/admin") || readStoredAttribution() !== null) {
    return;
  }

  const utm = buildAttribution({
    search: window.location.search,
    pathname: window.location.pathname,
    referrer: document.referrer,
    origin: window.location.origin,
  });
  const secure = window.location.protocol === "https:" ? "; Secure" : "";

  document.cookie =
    `${ATTRIBUTION_COOKIE}=${encodeURIComponent(JSON.stringify(utm))}` +
    `; Max-Age=${ATTRIBUTION_MAX_AGE_S}; Path=/; SameSite=Lax${secure}`;
}
