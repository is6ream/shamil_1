import { NextRequest, NextResponse } from "next/server";
import { donorIpHeaders } from "./donor-ip-forwarding";
import { API_URL, SITE_URL } from "@/lib/site";

const headers = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" };
const cookie = "shamil-donor-session";
function failure(status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message } }, { status, headers });
}
export async function donorBff(request: NextRequest, endpoint: string) {
  const allowed = /^(?:donor\/auth\/(?:request-code|verify|session|logout)|donor\/subscriptions(?:\/(?:claim|[0-9a-f-]{36}(?:\/(?:history|cancel))?))?|donations\/(?:capabilities|recurring\/checkout))$/;
  if (!allowed.test(endpoint)) return failure(404, "NOT_FOUND", "Маршрут не найден");
  const get = request.method === "GET";
  const expectedGet = /(?:\/session|\/capabilities|\/history)$/.test(endpoint)
    || /^donor\/subscriptions(?:\/[0-9a-f-]{36})?$/.test(endpoint);
  if (get !== expectedGet) return failure(405, "VALIDATION_ERROR", "Метод недоступен");
  if (!get && (request.headers.get("origin") !== new URL(SITE_URL).origin || request.headers.get("sec-fetch-site") !== "same-origin")) {
    return failure(403, "ORIGIN_FORBIDDEN", "Обновите страницу и повторите действие");
  }
  const query = new URLSearchParams();
  for (const [key, value] of request.nextUrl.searchParams) {
    if (!expectedGet || !endpoint.startsWith("donor/subscriptions") || !["cursor", "limit"].includes(key) || query.has(key)) return failure(400, "VALIDATION_ERROR", "Неверные параметры");
    query.set(key, value);
  }
  try {
    let body: string | undefined;
    if (!get) {
      const reader = request.body?.getReader(); const chunks: Uint8Array[] = []; let size = 0;
      if (reader) for (;;) {
        const { value, done } = await reader.read(); if (done) break;
        size += value.byteLength;
        if (size > 16384) { await reader.cancel(); return failure(413, "VALIDATION_ERROR", "Запрос слишком большой"); }
        chunks.push(value);
      }
      body = Buffer.concat(chunks).toString("utf8") || "{}";
      try { JSON.parse(body); } catch { return failure(400, "VALIDATION_ERROR", "Неверный JSON"); }
    }
    const outgoing: Record<string, string> = { "Content-Type": "application/json", ...donorIpHeaders(request, endpoint) };
    const token = request.cookies.get(cookie)?.value;
    if (token && /^[A-Za-z0-9_-]{43}$/.test(token)) outgoing.Authorization = "Bearer " + token;
    const key = request.headers.get("idempotency-key");
    if (endpoint === "donations/recurring/checkout" && key) outgoing["Idempotency-Key"] = key;
    const upstream = await fetch(API_URL + "/" + endpoint + (query.size ? "?" + query : ""), {
      method: request.method, headers: outgoing, body, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(15000),
    });
    const data = upstream.status === 204 ? null : await upstream.json();
    let session: string | undefined;
    if (endpoint === "donor/auth/verify" && upstream.ok) {
      session = data.sessionToken; delete data.sessionToken;
      if (typeof session !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(session)) return failure(503, "SERVICE_UNAVAILABLE", "Вход не подтверждён");
    }
    const response = upstream.status === 204 ? new NextResponse(null, { status: 204, headers }) : NextResponse.json(data, { status: upstream.status, headers });
    const retry = upstream.headers.get("retry-after"); if (retry) response.headers.set("Retry-After", retry);
    if (session || (endpoint === "donor/auth/logout" && upstream.ok) || (upstream.status === 401 && data?.error?.code === "AUTH_REQUIRED")) response.cookies.set(cookie, session ?? "", {
      httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/api", maxAge: session ? 2592000 : 0,
    });
    return response;
  } catch { return failure(503, "SERVICE_UNAVAILABLE", "Ответ сервера не получен. Проверьте состояние и повторите запрос"); }
}
