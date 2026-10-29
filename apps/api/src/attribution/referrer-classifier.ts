/**
 * Источник визита по Referer, когда UTM-меток нет.
 *
 * Классификация живёт на бэкенде, а не во фронтенде: правила будут меняться
 * (новый мессенджер, новая соцсеть), и менять их нужно в одном месте, а не
 * ждать, пока у всех обновится закэшированный бандл.
 *
 * Значения medium — по соглашению Google Analytics: `referral` для перехода
 * с сайта или из мессенджера, `organic` для поисковика, `none` для прямого
 * захода. Источник — в нижнем регистре, как и нормализованные UTM-метки:
 * иначе `telegram` из метки и `telegram` из Referer разъехались бы в отчёте.
 */

export interface ClassifiedSource {
  readonly source: string;
  readonly medium: string;
}

export const DIRECT: ClassifiedSource = { source: 'direct', medium: 'none' };

const REFERRAL = 'referral';
const ORGANIC = 'organic';

/** Хост → источник. Совпадение — сам хост или его поддомен. */
const REFERRAL_HOSTS: ReadonlyArray<readonly [string, readonly string[]]> = [
  ['telegram', ['t.me', 'telegram.me', 'telegram.org']],
  ['instagram', ['instagram.com']],
  ['whatsapp', ['wa.me', 'whatsapp.com']],
  ['vk', ['vk.com', 'vk.ru', 'vk.me']],
  ['facebook', ['facebook.com', 'fb.com']],
  ['youtube', ['youtube.com', 'youtu.be']],
  ['ok', ['ok.ru']],
];

/**
 * Поисковики. Домены национальные (`yandex.kz`, `google.com.kg`), поэтому
 * проверяется метка домена второго уровня, а не точный хост.
 */
const SEARCH_ENGINES: ReadonlyArray<readonly [string, RegExp]> = [
  ['yandex', /(^|\.)(yandex\.[a-z]{2,3}(\.[a-z]{2})?|ya\.ru)$/],
  ['google', /(^|\.)google\.[a-z]{2,3}(\.[a-z]{2})?$/],
  ['bing', /(^|\.)bing\.com$/],
  ['duckduckgo', /(^|\.)duckduckgo\.com$/],
  ['mail.ru', /^go\.mail\.ru$/],
];

function matchesHost(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`);
}

function parseHost(referrer: string): string | null {
  try {
    const url = new URL(referrer);

    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return null;
    }

    return url.hostname.toLowerCase().replace(/\.$/, '');
  } catch {
    // Битый Referer — то же, что его отсутствие: донат от этого не страдает.
    return null;
  }
}

/**
 * @param referrer внешний Referer первого захода или `null`
 * @param ownHosts хосты нашего сайта: переход между своими страницами — не источник
 */
export function classifyReferrer(
  referrer: string | null,
  ownHosts: readonly string[] = [],
): ClassifiedSource {
  if (referrer === null || referrer.length === 0) {
    return DIRECT;
  }

  const host = parseHost(referrer);

  if (host === null || host.length === 0 || ownHosts.some((own) => matchesHost(host, own))) {
    return DIRECT;
  }

  for (const [source, domains] of REFERRAL_HOSTS) {
    if (domains.some((domain) => matchesHost(host, domain))) {
      return { source, medium: REFERRAL };
    }
  }

  for (const [source, pattern] of SEARCH_ENGINES) {
    if (pattern.test(host)) {
      return { source, medium: ORGANIC };
    }
  }

  // Незнакомый сайт: источником становится его хост без `www.` —
  // так в отчёте видно, где о сборе написали, даже без меток.
  return { source: host.replace(/^www\./, ''), medium: REFERRAL };
}
