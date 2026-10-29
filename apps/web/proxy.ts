import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import {
  ATTRIBUTION_MAX_AGE_S,
  FIRST_TOUCH_COOKIE,
  LAST_TOUCH_COOKIE,
  planAttributionCookies,
} from "@/lib/attribution";

/**
 * Proxy (бывший middleware, Next 16): атрибуция визита в first-party cookie.
 *
 * Работает до рендера, поэтому страницы остаются статическими и кэшируемыми:
 * proxy только добавляет `Set-Cookie` к ответу и ничего не переписывает.
 * Решение «что писать» — в чистой `planAttributionCookies`, здесь только
 * чтение запроса и запись ответа.
 *
 * Cookie без `HttpOnly` намеренно: форма доната читает их в браузере и кладёт
 * в тело `POST /donations`. Секретов в них нет — только метки из адреса.
 */
export function proxy(request: NextRequest): NextResponse {
  const response = NextResponse.next();

  if (!isPageNavigation(request)) {
    return response;
  }

  const { nextUrl } = request;
  const plan = planAttributionCookies(
    {
      search: nextUrl.search,
      pathname: nextUrl.pathname,
      referrer: request.headers.get("referer") ?? "",
      origin: nextUrl.origin,
      now: new Date(),
    },
    request.cookies.get(FIRST_TOUCH_COOKIE)?.value,
  );
  const cookie = {
    path: "/",
    maxAge: ATTRIBUTION_MAX_AGE_S,
    sameSite: "lax",
    secure: nextUrl.protocol === "https:",
  } as const;

  if (plan.firstTouch !== undefined) {
    response.cookies.set({ name: FIRST_TOUCH_COOKIE, value: plan.firstTouch, ...cookie });
  }

  if (plan.lastTouch !== undefined) {
    response.cookies.set({ name: LAST_TOUCH_COOKIE, value: plan.lastTouch, ...cookie });
  }

  return response;
}

/**
 * Только переход человека на страницу. Prefetch ссылок и RSC-запросы
 * клиентской навигации идут без меток и без внешнего Referer — по ним
 * first-touch записался бы как «прямой заход» раньше настоящего визита.
 */
function isPageNavigation(request: NextRequest): boolean {
  if (request.method !== "GET" || request.headers.has("next-router-prefetch") || request.headers.has("rsc")) {
    return false;
  }

  const destination = request.headers.get("sec-fetch-dest");

  // Старые браузеры без Fetch Metadata — по Accept.
  return destination === null
    ? (request.headers.get("accept") ?? "").includes("text/html")
    : destination === "document";
}

export const config = {
  // Не страницы сайта: API, сборка, админка, короткие ссылки и файлы с расширением.
  matcher: ["/((?!api/|_next/|admin|go/|.*\\..*).*)"],
};
