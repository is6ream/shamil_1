/**
 * Короткая ссылка `mechetshamil.ru/go/<slug>` для QR и соцсетей.
 *
 * Сайт спрашивает у API, куда вести (`GET /api/go/<slug>` отвечает 302
 * и считает клик), и отдаёт человеку тот же редирект. В QR печатается
 * основной домен, а не адрес API: его узнают и ему доверяют.
 *
 * Правило одно: человек, отсканировавший QR, всегда попадает на сайт.
 * Нет ссылки, выключена, API лежит или ответил странно — главная.
 */

/** Сколько ждём API. QR сканируют на улице, с мобильного интернета. */
export const SHORT_LINK_TIMEOUT_MS = 3_000;

/** Слаг — зеркало `SHORT_LINK_SLUG_PATTERN` бэкенда. Чужое в API не отправляем. */
const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const SLUG_MAX_LENGTH = 64;

export function isValidSlug(slug: string): boolean {
  return slug.length <= SLUG_MAX_LENGTH && SLUG_PATTERN.test(slug);
}

/**
 * Принимаем от API только адрес своего сайта. API и так собирает его
 * из `PUBLIC_SITE_URL`, но редирект с нашего домена на чужой — это
 * открытый редирект, и вторая проверка на границе стоит одну строку.
 */
export function safeRedirectTarget(location: string | null, siteUrl: string): string {
  const home = new URL("/", siteUrl).toString();

  if (location === null || location === "") {
    return home;
  }

  try {
    const target = new URL(location, siteUrl);

    return target.origin === new URL(siteUrl).origin ? target.toString() : home;
  } catch {
    // Битый Location — человек всё равно должен попасть на сайт.
    return home;
  }
}

export interface ShortLinkLookup {
  readonly slug: string;
  readonly userAgent: string | null;
  readonly apiUrl: string;
  readonly siteUrl: string;
  /** Подменяется в тестах. */
  readonly fetchImpl?: typeof fetch;
}

/** Куда вести человека. Никогда не бросает. */
export async function resolveShortLink(lookup: ShortLinkLookup): Promise<string> {
  const home = safeRedirectTarget(null, lookup.siteUrl);

  if (!isValidSlug(lookup.slug)) {
    return home;
  }

  const fetchImpl = lookup.fetchImpl ?? fetch;

  try {
    const response = await fetchImpl(`${lookup.apiUrl}/go/${encodeURIComponent(lookup.slug)}`, {
      redirect: "manual",
      cache: "no-store",
      // User-agent человека: по нему API отличает превью мессенджера от клика.
      headers: { "user-agent": lookup.userAgent ?? "" },
      signal: AbortSignal.timeout(SHORT_LINK_TIMEOUT_MS),
    });

    return response.status >= 300 && response.status < 400
      ? safeRedirectTarget(response.headers.get("location"), lookup.siteUrl)
      : home;
  } catch {
    // Таймаут или сеть: клик не посчитан, но человек на сайте — это важнее.
    return home;
  }
}
