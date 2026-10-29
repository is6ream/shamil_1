import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { isValidSlug, resolveShortLink, safeRedirectTarget } from "./short-link";

const SITE = "https://mechetshamil.ru";
const API = "https://api.mechetshamil.ru/api";
const HOME = `${SITE}/`;

function apiReplying(status: number, location: string | null): { fetchImpl: typeof fetch; calls: string[] } {
  const calls: string[] = [];
  const fetchImpl = (async (input: string | URL | Request) => {
    calls.push(String(input));

    return new Response(null, { status, headers: location === null ? {} : { location } });
  }) as typeof fetch;

  return { fetchImpl, calls };
}

describe("safeRedirectTarget", () => {
  test("адрес своего сайта пропускается как есть", () => {
    assert.equal(safeRedirectTarget(`${SITE}/02/?utm_source=qr`, SITE), `${SITE}/02/?utm_source=qr`);
  });

  for (const location of ["https://evil.example/", "//evil.example/x", "javascript:alert(1)", "", null]) {
    test(`«${String(location)}» → главная`, () => {
      assert.equal(safeRedirectTarget(location, SITE), HOME);
    });
  }
});

describe("isValidSlug", () => {
  test("строчные латиница, цифры и дефис", () => {
    assert.equal(isValidSlug("qr-mosque-2026"), true);
    assert.equal(isValidSlug("QR"), false);
    assert.equal(isValidSlug("../admin"), false);
    assert.equal(isValidSlug("x".repeat(65)), false);
  });
});

describe("resolveShortLink", () => {
  test("302 от API — тот же адрес человеку", async () => {
    // Arrange
    const api = apiReplying(302, `${SITE}/?utm_source=qr`);

    // Act
    const location = await resolveShortLink({ slug: "qr", userAgent: "Mozilla", apiUrl: API, siteUrl: SITE, fetchImpl: api.fetchImpl });

    // Assert
    assert.equal(location, `${SITE}/?utm_source=qr`);
    assert.deepEqual(api.calls, [`${API}/go/qr`]);
  });

  test("недопустимый слаг до API не доходит", async () => {
    // Arrange
    const api = apiReplying(302, `${SITE}/x`);

    // Act
    const location = await resolveShortLink({ slug: "../x", userAgent: null, apiUrl: API, siteUrl: SITE, fetchImpl: api.fetchImpl });

    // Assert
    assert.equal(location, HOME);
    assert.equal(api.calls.length, 0);
  });

  test("API ответил ошибкой — главная", async () => {
    const api = apiReplying(500, null);

    assert.equal(await resolveShortLink({ slug: "qr", userAgent: null, apiUrl: API, siteUrl: SITE, fetchImpl: api.fetchImpl }), HOME);
  });

  test("API недоступен — главная, без исключения", async () => {
    // Arrange
    const fetchImpl = (async () => {
      throw new TypeError("fetch failed");
    }) as typeof fetch;

    // Act & Assert
    assert.equal(await resolveShortLink({ slug: "qr", userAgent: null, apiUrl: API, siteUrl: SITE, fetchImpl }), HOME);
  });

  test("API вернул чужой домен — главная", async () => {
    const api = apiReplying(302, "https://evil.example/");

    assert.equal(await resolveShortLink({ slug: "qr", userAgent: null, apiUrl: API, siteUrl: SITE, fetchImpl: api.fetchImpl }), HOME);
  });
});
