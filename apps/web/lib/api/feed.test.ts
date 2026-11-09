import assert from "node:assert/strict";
import { test } from "node:test";

import { getFeed } from "./showcase";

test("лента: обе первые страницы и продолжение обходят серверный и браузерный кеш", async (t) => {
  const calls: { url: URL; init?: RequestInit & { next?: { revalidate?: number | false } } }[] = [];
  t.mock.method(globalThis, "fetch", async (input: string, init?: RequestInit) => {
    calls.push({ url: new URL(input), init });
    return Response.json({ items: [], nextCursor: null });
  });

  await getFeed(); // главная
  await getFeed(); // отчёты
  await getFeed("opaque+/=cursor");

  assert.equal(calls.length, 3);
  for (const { url, init } of calls) {
    assert.equal(url.pathname.endsWith("/donations/feed"), true);
    assert.equal(url.searchParams.get("limit"), "6");
    assert.equal(init?.cache, "no-store");
    assert.equal(init?.next?.revalidate, 0);
  }
  assert.equal(calls[0].url.href, calls[1].url.href);
  assert.equal(calls[0].url.searchParams.has("cursor"), false);
  assert.equal(calls[2].url.searchParams.get("cursor"), "opaque+/=cursor");
});
