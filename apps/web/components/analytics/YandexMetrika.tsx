"use client";

import { usePathname, useSearchParams } from "next/navigation";
import Script from "next/script";
import { Suspense, useEffect, useLayoutEffect } from "react";

import { METRIKA_CONFIG } from "@/lib/analytics/config";
import { isAnalyticsAllowed } from "@/lib/analytics/consent";
import { TAG_URL, installMetrikaQueue, stopMetrika, metrika } from "@/lib/analytics/metrika";
import { buildPageUrl, createPageviewTracker } from "@/lib/analytics/pageview";
import { isTrackedPath } from "@/lib/analytics/tracked-paths";

import { useConsent } from "./useConsent";

/** Один трекер на вкладку: переживает перемонтирование в Strict Mode. */
const pageviews = createPageviewTracker((url, referer) => {
  metrika.hit(url, referer === undefined ? undefined : { referer });
});

interface PageviewsProps {
  readonly counterId: number;
  readonly webvisor: boolean;
}

/**
 * Хит на каждую смену адреса — счётчик в режиме `defer: true` сам их не шлёт.
 * Очередь `ym` и `init` ставятся в том же эффекте, до первого хита: эффекты
 * дочерних компонентов срабатывают раньше родительских, и иначе первый хит
 * ушёл бы в пустоту. `installMetrikaQueue` идемпотентна.
 */
function MetrikaPageviews({ counterId, webvisor }: PageviewsProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useLayoutEffect(() => {
    installMetrikaQueue(window, counterId, { webvisor });
    return () => { stopMetrika(window, counterId); pageviews.reset(); };
  }, [counterId, webvisor]);

  useEffect(() => {
    installMetrikaQueue(window, counterId, { webvisor });
    pageviews.track(buildPageUrl(window.location.origin, pathname, searchParams.toString()), document.referrer);
    // Цели, сработавшие до «Принять», — после первого хита, чтобы попасть в визит.
    metrika.flushPending();
  }, [counterId, webvisor, pathname, searchParams]);

  return null;
}

/**
 * Счётчик Яндекс Метрики. Не грузится вовсе, если:
 * - сборка без `NEXT_PUBLIC_YM_ENABLED=true` и номера счётчика;
 * - это админка (`isTrackedPath`);
 * - требуется согласие (`NEXT_PUBLIC_YM_REQUIRE_CONSENT`, по умолчанию да),
 *   а человек его не дал или отказался.
 *
 * `<noscript>`-пиксель — только в режиме без согласия: без JS спросить
 * согласие нельзя, а пиксель без согласия — та же загрузка счётчика.
 */
export function YandexMetrika() {
  const consent = useConsent();
  const pathname = usePathname();
  const { counterId, requireConsent, webvisor } = METRIKA_CONFIG;

  // Отказ: цели, накопленные до ответа, не уйдут никогда.
  useEffect(() => {
    if (consent !== null && consent !== "unknown" && !isAnalyticsAllowed(consent, requireConsent)) {
      metrika.discardPending();
    }
  }, [consent, requireConsent]);

  if (counterId === null || !isTrackedPath(pathname)) {
    return null;
  }

  const isAllowed = consent !== null && isAnalyticsAllowed(consent, requireConsent);

  return (
    <>
      {requireConsent ? null : (
        <noscript>
          <div>
            {/* eslint-disable-next-line @next/next/no-img-element -- пиксель счётчика по официальному коду */}
            <img src={`https://mc.yandex.ru/watch/${counterId}`} style={{ position: "absolute", left: "-9999px" }} alt="" />
          </div>
        </noscript>
      )}
      {isAllowed ? (
        <>
          {/* useSearchParams требует границы Suspense — иначе страница уйдёт в клиентский рендер. */}
          <Suspense fallback={null}>
            <MetrikaPageviews counterId={counterId} webvisor={webvisor} />
          </Suspense>
          <Script id="yandex-metrika" src={`${TAG_URL}?id=${counterId}`} strategy="afterInteractive" />
        </>
      ) : null}
    </>
  );
}
