/**
 * Атрибуция визита: UTM-метки, внешний Referer и страница входа.
 *
 * Две cookie на 90 дней, обе ставит `proxy.ts` на запросе страницы — до
 * рендера, поэтому SSR и кэш страниц от них не зависят:
 *
 * - `shamil_ft` — first-touch: пишется один раз, при первом визите, и не
 *   перезаписывается. Отвечает на вопрос «откуда человек узнал о сборе».
 * - `shamil_lt` — last-touch: обновляется при каждом заходе **с метками**.
 *   Прямой повторный заход его не трогает: «вернулся по закладке» — не канал.
 *
 * Форма доната читает обе cookie и отправляет их полем `attribution`.
 * Источник по Referer здесь не вычисляется: это делает бэкенд
 * (`AttributionService`), фронт передаёт сырой Referer.
 *
 * Метка не имеет права сорвать донат. Поэтому всё, что бэкенд отклонил бы
 * (длина, символы), отбрасывается здесь же, а не уходит на сервер.
 * Правила — зеркало `apps/api/src/attribution/attribution.constants.ts`.
 *
 * Модуль чистый, кроме `readStoredAttribution` с `document`: её вызывают
 * только клиентские компоненты.
 */

import type { DonationAttribution, UtmTouch } from "@/lib/api/types";

/** Имя прежнее: cookie, выставленные до перехода на proxy, продолжают работать. */
export const FIRST_TOUCH_COOKIE = "shamil_ft";

export const LAST_TOUCH_COOKIE = "shamil_lt";

/** 90 дней — окно атрибуции. Зеркало `ATTRIBUTION_WINDOW_DAYS` бэкенда. */
export const ATTRIBUTION_MAX_AGE_S = 90 * 24 * 60 * 60;

const UTM_VALUE_MAX_LENGTH = 128;
const URL_MAX_LENGTH = 512;
/** Без `@`: e-mail в метке — персональные данные. */
const UTM_VALUE_PATTERN = /^[\p{L}\p{N} _\-.~+%:/|]+$/u;
const LANDING_PAGE_PATTERN = /^\/[^\s<>"']*$/;

/** Параметр URL → поле касания. */
const UTM_PARAMS = [
  ["utm_source", "source"],
  ["utm_medium", "medium"],
  ["utm_campaign", "campaign"],
  ["utm_content", "content"],
  ["utm_term", "term"],
] as const;

type UtmField = (typeof UTM_PARAMS)[number][1];

type MutableTouch = { -readonly [K in keyof UtmTouch]: UtmTouch[K] };

/** Содержимое cookie первого захода. `at` — ISO-время визита. */
export interface FirstTouch extends UtmTouch {
  readonly referrer?: string;
  readonly landingPage?: string;
  readonly at?: string;
}

type MutableFirstTouch = { -readonly [K in keyof FirstTouch]: FirstTouch[K] };

function cleanUtmValue(raw: string | null | undefined): string | undefined {
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

function cleanTimestamp(raw: unknown): string | undefined {
  if (typeof raw !== "string" || raw.length > 40) {
    return undefined;
  }

  const time = Date.parse(raw);

  return Number.isNaN(time) ? undefined : new Date(time).toISOString();
}

function hasKeys(value: object): boolean {
  return Object.keys(value).length > 0;
}

/** UTM-метки из query. `null` — меток нет: last-touch не обновляется. */
export function readUtmParams(search: string): UtmTouch | null {
  const params = new URLSearchParams(search);
  const touch: MutableTouch = {};

  for (const [param, field] of UTM_PARAMS) {
    const value = cleanUtmValue(params.get(param));

    if (value !== undefined) {
      touch[field] = value;
    }
  }

  return hasKeys(touch) ? touch : null;
}

export interface LandingContext {
  /** Query страницы входа, с `?` или без. */
  readonly search: string;
  readonly pathname: string;
  /** Заголовок `Referer` запроса страницы. */
  readonly referrer: string;
  /** Свой origin — чтобы не считать переход по сайту источником. */
  readonly origin: string;
  readonly now: Date;
}

/** Первое касание: метки, внешний Referer, страница и время захода. */
export function buildFirstTouch(context: LandingContext): FirstTouch {
  const touch: MutableFirstTouch = { ...readUtmParams(context.search) };
  const referrer = cleanReferrer(context.referrer, context.origin);

  if (referrer !== undefined) {
    touch.referrer = referrer;
  }

  const query = new URLSearchParams(context.search).toString();
  const landingPage = cleanLandingPage(query === "" ? context.pathname : `${context.pathname}?${query}`);

  if (landingPage !== undefined) {
    touch.landingPage = landingPage;
  }

  touch.at = context.now.toISOString();

  return touch;
}

function parseJsonObject(raw: string | undefined): Record<string, unknown> | null {
  if (raw === undefined || raw === "") {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(raw);

    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    // Испорченная cookie — атрибуции нет, донат идёт без неё.
    return null;
  }
}

function pickUtm(source: Record<string, unknown>): MutableTouch {
  const touch: MutableTouch = {};

  for (const [, field] of UTM_PARAMS) {
    const raw = source[field];
    const value = typeof raw === "string" ? cleanUtmValue(raw) : undefined;

    if (value !== undefined) {
      touch[field as UtmField] = value;
    }
  }

  return touch;
}

/**
 * Разбор cookie первого захода. Значение могли подменить руками, поэтому
 * каждое поле проверяется заново, а не принимается на веру.
 * Принимает и прежний формат без `at`.
 */
export function parseFirstTouch(raw: string | undefined): FirstTouch | null {
  const parsed = parseJsonObject(raw);

  if (parsed === null) {
    return null;
  }

  const touch: MutableFirstTouch = pickUtm(parsed);
  const referrer = typeof parsed.referrer === "string" ? cleanReferrer(parsed.referrer, "") : undefined;
  const landingPage = typeof parsed.landingPage === "string" ? cleanLandingPage(parsed.landingPage) : undefined;
  const at = cleanTimestamp(parsed.at);

  if (referrer !== undefined) {
    touch.referrer = referrer;
  }

  if (landingPage !== undefined) {
    touch.landingPage = landingPage;
  }

  if (at !== undefined) {
    touch.at = at;
  }

  return touch;
}

export function parseLastTouch(raw: string | undefined): UtmTouch | null {
  const parsed = parseJsonObject(raw);

  if (parsed === null) {
    return null;
  }

  const touch = pickUtm(parsed);

  return hasKeys(touch) ? touch : null;
}

/** Какие cookie поставить на этот заход. Поле отсутствует — cookie не трогаем. */
export interface AttributionCookiePlan {
  readonly firstTouch?: string;
  readonly lastTouch?: string;
}

/**
 * Решение proxy, вынесенное в чистую функцию:
 * first-touch — только если валидной cookie ещё нет;
 * last-touch — только если в адресе есть метки.
 * Значения — JSON; кодирует их для заголовка сам Next.
 */
export function planAttributionCookies(
  context: LandingContext,
  existingFirstTouch: string | undefined,
): AttributionCookiePlan {
  const plan: { firstTouch?: string; lastTouch?: string } = {};

  if (parseFirstTouch(existingFirstTouch) === null) {
    plan.firstTouch = JSON.stringify(buildFirstTouch(context));
  }

  const utm = readUtmParams(context.search);

  if (utm !== null) {
    plan.lastTouch = JSON.stringify(utm);
  }

  return plan;
}

/** Атрибуция для тела доната из значений cookie. `null` — cookie нет. */
export function toDonationAttribution(
  firstTouchRaw: string | undefined,
  lastTouchRaw: string | undefined,
): DonationAttribution | null {
  const firstTouch = parseFirstTouch(firstTouchRaw);
  const lastTouch = parseLastTouch(lastTouchRaw);

  if (firstTouch === null && lastTouch === null) {
    return null;
  }

  const { referrer, landingPage, at, ...utm } = firstTouch ?? {};

  return {
    ...(hasKeys(utm) ? { first: utm } : {}),
    ...(lastTouch === null ? {} : { last: lastTouch }),
    ...(referrer === undefined ? {} : { referrer }),
    ...(landingPage === undefined ? {} : { landingPage }),
    ...(at === undefined ? {} : { firstTouchAt: at }),
  };
}

/** Значение cookie из заголовка `Cookie` / `document.cookie`, уже декодированное. */
export function readCookie(cookieHeader: string, name: string): string | undefined {
  const entry = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`));

  if (entry === undefined) {
    return undefined;
  }

  try {
    return decodeURIComponent(entry.slice(name.length + 1));
  } catch {
    // Битая percent-кодировка — cookie как будто нет.
    return undefined;
  }
}

/** Атрибуция из cookie браузера. Только на клиенте. */
export function readStoredAttribution(): DonationAttribution | null {
  return toDonationAttribution(
    readCookie(document.cookie, FIRST_TOUCH_COOKIE),
    readCookie(document.cookie, LAST_TOUCH_COOKIE),
  );
}
