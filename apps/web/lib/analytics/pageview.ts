/**
 * Просмотры страниц для SPA-режима счётчика (`defer: true`).
 *
 * Счётчик сам просмотров не шлёт — их шлёт компонент на каждой смене адреса.
 * Трекер помнит последний адрес и пропускает повтор: React Strict Mode в dev
 * дважды запускает эффекты, а первая загрузка не должна дать два хита.
 */

import { readUtmParams } from "@/lib/attribution";

export type SendHit = (url: string, referer: string | undefined) => void;

export interface PageviewTracker {
  /** `true` — хит отправлен, `false` — адрес тот же, повтор пропущен. */
  track(url: string, documentReferrer: string): boolean;
  reset(): void;
}

/**
 * Referer первого хита — `document.referrer` (откуда пришли на сайт), каждого
 * следующего — предыдущий адрес сайта: так Метрика видит переходы внутри SPA.
 */
export function createPageviewTracker(send: SendHit): PageviewTracker {
  let lastUrl: string | null = null;

  return {
    reset() { lastUrl = null; },
    track(url, documentReferrer) {
      if (url === lastUrl) {
        return false;
      }

      let external: string | undefined;
      try { const url = new URL(documentReferrer); external = `${url.origin}${url.pathname}`; } catch { /* No external referrer. */ }
      const referer = lastUrl ?? external;

      lastUrl = url;
      send(url, referer);

      return true;
    },
  };
}

/** Адрес хита: origin + путь + query. Пустой query — без `?`. */
export function buildPageUrl(origin: string, pathname: string, search: string): string {
  const values = new URLSearchParams(search);
  const utm = readUtmParams(values.toString());
  const safe = new URLSearchParams();
  for (const [key, value] of Object.entries(utm ?? {})) safe.set(`utm_${key}`, value);
  const yclid = values.get('yclid');
  if (yclid && /^[0-9]{1,64}$/.test(yclid)) safe.set('yclid', yclid);
  const query = safe.toString();

  return query === "" ? `${origin}${pathname}` : `${origin}${pathname}?${query}`;
}
