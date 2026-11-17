import { NextRequest, NextResponse } from "next/server";
import { API_URL, SITE_URL } from "@/lib/site";
const cookie = "shamil-recurring";
const path = "/api/donation-recurring";
const headers = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" };
const valid = (value?: string): value is string => typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
const error = (status: number) => NextResponse.json({ message: "Доступ к подписке не подтверждён" }, { status, headers });
async function forward(key: string, cancel = false) {
  try {
    const upstream = await fetch(API_URL + "/donations/recurring" + (cancel ? "/cancel" : ""), {
      method: cancel ? "POST" : "GET", headers: { Authorization: "Bearer " + key },
      cache: "no-store", redirect: "error", signal: AbortSignal.timeout(15000),
    });
    return NextResponse.json(await upstream.json(), { status: upstream.status, headers });
  } catch { return error(503); }
}
export async function GET(request: NextRequest) {
  if (request.nextUrl.searchParams.toString() !== "status=1") return error(400);
  const key = request.cookies.get(cookie)?.value;
  return valid(key) ? forward(key) : error(404);
}
export async function POST(request: NextRequest) {
  if (request.headers.get("origin") !== new URL(SITE_URL).origin || request.headers.get("sec-fetch-site") !== "same-origin") return error(403);
  const action = request.nextUrl.searchParams.toString();
  const key = request.cookies.get(cookie)?.value;
  if (action === "access=1") return valid(key) ? NextResponse.json({ code: key }, { headers }) : error(404);
  if (action === "cancel=1") return valid(key) ? forward(key, true) : error(404);
  if (action !== "restore=1") return error(400); // No legacy checkout or new legacy keys.
  try {
    const reader = request.body?.getReader(); let size = 0; const chunks: Uint8Array[] = [];
    if (reader) for (;;) { const {value,done} = await reader.read(); if (done) break;
      size += value.byteLength; if (size > 256) { await reader.cancel(); return error(413); } chunks.push(value); }
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!body || typeof body !== "object" || Object.keys(body).length !== 1 || !valid(body.code)) return error(400);
    const response = await forward(body.code);
    if (response.ok) response.cookies.set(cookie, body.code, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path, maxAge: 400 * 86400 });
    return response;
  } catch { return error(400); }
}
