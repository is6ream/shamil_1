import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { createAdminClient } from "./api-client";
import { AdminApiError } from "./errors";

const BASE = "http://api.test/api";

interface Call {
  readonly url: string;
  readonly authorization: string | null;
  readonly credentials: RequestCredentials | undefined;
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** Фейковый API: refresh выдаёт `fresh-N`, защищённый маршрут пускает только последний токен. */
function fakeApi(options: { readonly refreshOk: boolean }) {
  const calls: Call[] = [];
  let issued = 0;
  let validToken: string | null = null;

  const fetchImpl: typeof fetch = async (input, init) => {
    const url = String(input);
    const headers = new Headers(init?.headers);
    calls.push({ url, authorization: headers.get("Authorization"), credentials: init?.credentials });

    if (url.endsWith("/admin/auth/refresh")) {
      // Даём параллельным запросам шанс прийти за вторым refresh, если защиты нет.
      await new Promise((resolve) => setTimeout(resolve, 5));

      if (!options.refreshOk) {
        return json(401, { message: "Unauthorized" });
      }

      issued += 1;
      validToken = `fresh-${issued}`;
      return json(200, { accessToken: validToken });
    }

    if (headers.get("Authorization") === `Bearer ${validToken}`) {
      return json(200, { ok: true });
    }

    return json(401, { message: "Unauthorized" });
  };

  return { calls, fetchImpl, refreshCount: () => calls.filter((c) => c.url.endsWith("/refresh")).length };
}

/**
 * Браузер с одной refresh-cookie на все вкладки и API с ротацией без окна
 * на гонку, как `RefreshTokenService.rotate`: повтор гашёного токена
 * отзывает семейство.
 */
function fakeCookieApi() {
  let cookie = "r0";
  let issued = 0;
  let isRevoked = false;
  const consumed = new Set<string>();

  const fetchImpl: typeof fetch = async () => {
    const presented = cookie;
    await new Promise((resolve) => setTimeout(resolve, 5));

    if (isRevoked || consumed.has(presented)) {
      isRevoked = true;
      return json(401, { message: "Сессия истекла или недействительна" });
    }

    consumed.add(presented);
    issued += 1;
    cookie = `r${issued}`;
    return json(200, { accessToken: `a${issued}` });
  };

  return { fetchImpl, isFamilyRevoked: () => isRevoked };
}

/** Взаимоисключение, как `navigator.locks.request` с одним именем. */
function mutex() {
  let tail: Promise<unknown> = Promise.resolve();

  return <T>(task: () => Promise<T>): Promise<T> => {
    const run = tail.then(task, task);
    tail = run.catch(() => undefined);
    return run;
  };
}

describe("createAdminClient", () => {
  test("на 401 обновляет сессию и повторяет запрос с новым токеном", async () => {
    // Arrange
    const api = fakeApi({ refreshOk: true });
    const client = createAdminClient({ baseUrl: BASE, fetchImpl: api.fetchImpl });
    client.setAccessToken("stale");

    // Act
    const result = await client.request<{ ok: boolean }>("/admin/donations");

    // Assert
    assert.deepEqual(result, { ok: true });
    assert.equal(api.refreshCount(), 1);
    assert.equal(api.calls.at(-1)?.authorization, "Bearer fresh-1");
  });

  test("параллельные 401 делят один refresh", async () => {
    const api = fakeApi({ refreshOk: true });
    const client = createAdminClient({ baseUrl: BASE, fetchImpl: api.fetchImpl });
    client.setAccessToken("stale");

    await Promise.all([
      client.request("/admin/a"),
      client.request("/admin/b"),
      client.request("/admin/c"),
    ]);

    assert.equal(api.refreshCount(), 1);
  });

  test("refresh не удался — сессия истекает, запрос падает с 401", async () => {
    const api = fakeApi({ refreshOk: false });
    let expiredCount = 0;
    const client = createAdminClient({
      baseUrl: BASE,
      fetchImpl: api.fetchImpl,
      onSessionExpired: () => {
        expiredCount += 1;
      },
    });
    client.setAccessToken("stale");

    await assert.rejects(client.request("/admin/a"), (error: unknown) => {
      return error instanceof AdminApiError && error.status === 401;
    });
    assert.equal(expiredCount, 1);
    assert.equal(client.hasAccessToken(), false);
  });

  test("skipAuthRetry: 401 входа не запускает refresh", async () => {
    const api = fakeApi({ refreshOk: true });
    const client = createAdminClient({ baseUrl: BASE, fetchImpl: api.fetchImpl });

    await assert.rejects(client.request("/admin/auth/login", { body: {}, skipAuthRetry: true }));
    assert.equal(api.refreshCount(), 0);
  });

  test("каждый запрос шлёт cookie (credentials: include)", async () => {
    const api = fakeApi({ refreshOk: true });
    const client = createAdminClient({ baseUrl: BASE, fetchImpl: api.fetchImpl });

    await client.refresh();
    await client.request("/admin/a");

    assert.ok(api.calls.every((call) => call.credentials === "include"));
  });

  test("две вкладки с общей блокировкой не отзывают сессию друг другу", async () => {
    const browser = fakeCookieApi();
    const lock = mutex();
    const tabA = createAdminClient({ baseUrl: BASE, fetchImpl: browser.fetchImpl, withRefreshLock: lock });
    const tabB = createAdminClient({ baseUrl: BASE, fetchImpl: browser.fetchImpl, withRefreshLock: lock });

    const results = await Promise.all([tabA.refresh(), tabB.refresh()]);

    assert.deepEqual(results, [true, true]);
    assert.equal(browser.isFamilyRevoked(), false);
  });

  test("без блокировки та же гонка отзывает семейство (модель бага)", async () => {
    const browser = fakeCookieApi();
    const noLock = <T>(task: () => Promise<T>) => task();
    const tabA = createAdminClient({ baseUrl: BASE, fetchImpl: browser.fetchImpl, withRefreshLock: noLock });
    const tabB = createAdminClient({ baseUrl: BASE, fetchImpl: browser.fetchImpl, withRefreshLock: noLock });

    await Promise.all([tabA.refresh(), tabB.refresh()]);

    assert.equal(browser.isFamilyRevoked(), true);
  });

  test("сетевой сбой превращается в понятную ошибку", async () => {
    const client = createAdminClient({
      baseUrl: BASE,
      fetchImpl: async () => {
        throw new TypeError("Failed to fetch");
      },
    });

    await assert.rejects(client.request("/admin/a"), (error: unknown) => {
      return error instanceof AdminApiError && error.status === 0 && error.message.includes("Нет связи");
    });
  });
});

/** XHR, который пускает только `Bearer fresh-1` и шлёт два события прогресса. */
function fakeXhrFactory(sent: string[]) {
  return () => {
    const headers = new Map<string, string>();
    const xhr = {
      status: 0,
      responseText: "",
      withCredentials: false,
      upload: { onprogress: null as ((event: { lengthComputable: boolean; loaded: number; total: number }) => void) | null },
      onload: null as (() => void) | null,
      onerror: null as (() => void) | null,
      onabort: null as (() => void) | null,
      open() {},
      abort() {},
      setRequestHeader(name: string, value: string) {
        headers.set(name, value);
      },
      send() {
        const auth = headers.get("Authorization") ?? "";

        sent.push(auth);
        setTimeout(() => {
          if (auth === "Bearer fresh-1") {
            xhr.upload.onprogress?.({ lengthComputable: true, loaded: 50, total: 100 });
            xhr.upload.onprogress?.({ lengthComputable: true, loaded: 100, total: 100 });
            xhr.status = 201;
            xhr.responseText = JSON.stringify({ id: "m1" });
          } else {
            xhr.status = 401;
            xhr.responseText = JSON.stringify({ message: "Требуется вход" });
          }

          xhr.onload?.();
        }, 1);
      },
    };

    return xhr as unknown as XMLHttpRequest;
  };
}

describe("upload", () => {
  test("401 → один refresh → повтор с новым токеном, прогресс доходит до 1", async () => {
    const api = fakeApi({ refreshOk: true });
    const sent: string[] = [];
    const progress: number[] = [];
    const client = createAdminClient({ baseUrl: BASE, fetchImpl: api.fetchImpl, xhrFactory: fakeXhrFactory(sent) });

    const result = await client.upload<{ id: string }>("/admin/media", new FormData(), (fraction) =>
      progress.push(fraction),
    );

    assert.deepEqual(result, { id: "m1" });
    assert.deepEqual(sent, ["", "Bearer fresh-1"]);
    assert.equal(api.refreshCount(), 1);
    assert.deepEqual(progress, [0.5, 1]);
  });

  test("ошибка сервера приходит AdminApiError с телом", async () => {
    const api = fakeApi({ refreshOk: false });
    const client = createAdminClient({ baseUrl: BASE, fetchImpl: api.fetchImpl, xhrFactory: fakeXhrFactory([]) });

    await assert.rejects(client.upload("/admin/media", new FormData()), (error: unknown) => {
      return error instanceof AdminApiError && error.status === 401;
    });
  });
});

describe("refresh: временный сбой не выводит из админки", () => {
  function apiWithRefreshStatus(status: number) {
    let refreshCalls = 0;
    const fetchImpl: typeof fetch = async (input) => {
      if (String(input).endsWith("/admin/auth/refresh")) {
        refreshCalls += 1;
        return json(status, { message: "ThrottlerException: Too Many Requests" });
      }

      return json(401, { message: "Unauthorized" });
    };

    return { fetchImpl, refreshCalls: () => refreshCalls };
  }

  test("429 на refresh — ошибка лимита, сессия не истекает", async () => {
    const api = apiWithRefreshStatus(429);
    let expiredCount = 0;
    const client = createAdminClient({ baseUrl: BASE, fetchImpl: api.fetchImpl, onSessionExpired: () => (expiredCount += 1) });
    client.setAccessToken("stale");

    await assert.rejects(client.request("/admin/a"), (error: unknown) => {
      return error instanceof AdminApiError && error.status === 429 && error.message.includes("Подождите");
    });
    assert.equal(expiredCount, 0);
  });

  test("503 на refresh при загрузке — исключение, а не «сессии нет»", async () => {
    const client = createAdminClient({ baseUrl: BASE, fetchImpl: apiWithRefreshStatus(503).fetchImpl });

    await assert.rejects(client.refresh(), (error: unknown) => error instanceof AdminApiError && error.status === 503);
  });

  test("401 на refresh — по-прежнему «сессии нет»", async () => {
    const client = createAdminClient({ baseUrl: BASE, fetchImpl: apiWithRefreshStatus(401).fetchImpl });

    assert.equal(await client.refresh(), false);
  });
});
