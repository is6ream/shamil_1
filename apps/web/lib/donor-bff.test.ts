import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { donorBff } from "./donor-bff";
import { SITE_URL } from "./site";
const origin = new URL(SITE_URL).origin;
const make = (headers: Record<string, string> = {}, body = "{}") => new NextRequest(origin + "/api/donor/auth/verify", {
  method: "POST", headers: { origin, "sec-fetch-site": "same-origin", "content-type": "application/json", ...headers }, body,
});
test("donor BFF rejects cross-origin, malformed and oversized requests before upstream", async () => {
  const original = global.fetch; let calls = 0;
  global.fetch = async () => { calls++; throw new Error("must not call"); };
  try {
    for (const headers of [{ origin: "https://attacker.test" }, { "sec-fetch-site": "cross-site" }] as Record<string, string>[]) {
      const response = await donorBff(make(headers), "donor/auth/verify"); assert.equal(response.status, 403);
      assert.equal(response.headers.get("cache-control"), "no-store");
    }
    assert.equal((await donorBff(make({}, "{"), "donor/auth/verify")).status, 400);
    assert.equal((await donorBff(make({}, "x".repeat(16385)), "donor/auth/verify")).status, 413);
    assert.equal((await donorBff(make(), "donor/auth/unknown")).status, 404);
    assert.equal(calls, 0);
  } finally { global.fetch = original; }
});
test("donor BFF keeps token out of JSON, sets private cookie and ignores client XFF", async () => {
  const original = global.fetch; const token = "s".repeat(43); let upstream: RequestInit | undefined;
  global.fetch = async (_url, init) => { upstream = init; return Response.json({ sessionToken: token, expiresAt: new Date(Date.now()+2592000000).toISOString(), donor: { id: "synthetic" } }); };
  try {
    const response = await donorBff(make({ "x-forwarded-for": "203.0.113.20", cookie: "shamil-donor-session="+token }), "donor/auth/verify");
    assert.equal(response.status, 200); assert.equal("sessionToken" in await response.json(), false);
    const cookie = response.headers.get("set-cookie")!;
    assert.match(cookie, /HttpOnly/i); assert.match(cookie, /SameSite=strict/i); assert.match(cookie, /Path=\/api/);
    assert.equal(new Headers(upstream?.headers).get("authorization"), "Bearer "+token);
    assert.equal(new Headers(upstream?.headers).get("x-forwarded-for"), null);
    assert.equal(upstream?.cache, "no-store"); assert.equal(upstream?.redirect, "error");
    assert.equal(response.headers.get("referrer-policy"), "no-referrer");
  } finally { global.fetch = original; }
});
test("donor BFF logout clears cookie and upstream failure reveals no details", async () => {
  const original = global.fetch;
  try {
    global.fetch = async () => new Response(null, { status: 204 });
    const loggedOut = await donorBff(make(), "donor/auth/logout"); assert.equal(loggedOut.status, 204);
    assert.match(loggedOut.headers.get("set-cookie")!, /Max-Age=0/);
    global.fetch = async () => { throw new Error("private upstream detail"); };
    const failed = await donorBff(make(), "donor/auth/verify"); assert.equal(failed.status, 503);
    assert.equal((await failed.text()).includes("private upstream"), false);
  } finally { global.fetch = original; }
});

test("donor BFF clears an expired session cookie but keeps it on an invalid email code", async () => {
  const original=global.fetch;
  try {
    global.fetch=async()=>Response.json({error:{code:"AUTH_REQUIRED",message:"Войдите"}},{status:401});
    const expired=await donorBff(new NextRequest(origin+"/api/donor/auth/session",{headers:{cookie:"shamil-donor-session="+"s".repeat(43)}}),"donor/auth/session");
    assert.equal(expired.status,401); assert.match(expired.headers.get("set-cookie")!,/Max-Age=0/);
    global.fetch=async()=>Response.json({error:{code:"EMAIL_CODE_INVALID",message:"Код неверный"}},{status:401});
    const wrong=await donorBff(make(),"donor/auth/verify"); assert.equal(wrong.headers.get("set-cookie"),null);
  } finally {global.fetch=original;}
});
