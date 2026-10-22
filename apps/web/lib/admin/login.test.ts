import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { createAdminClient } from "./api-client";
import { AdminApiError, NETWORK_ERROR_STATUS } from "./errors";
import { WRONG_CREDENTIALS, loginHref, loginRequest, safeNextPath } from "./login";

const BASE = "http://api.test/api";

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

interface Sent {
  readonly url: string;
  readonly body: unknown;
}

/** Клиент с одним ответом на любой запрос; тела запросов копятся в `sent`. */
function clientAnswering(answer: () => Response) {
  const sent: Sent[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    sent.push({ url: String(input), body: JSON.parse(String(init?.body ?? "null")) as unknown });
    return answer();
  };

  return { sent, client: createAdminClient({ baseUrl: BASE, fetchImpl }) };
}

async function rejection(promise: Promise<unknown>): Promise<AdminApiError> {
  try {
    await promise;
  } catch (error: unknown) {
    assert.ok(error instanceof AdminApiError);
    return error;
  }

  assert.fail("ожидалась ошибка");
}

const USER = { id: "u1", email: "imam@example.ru", role: "SUPER_ADMIN", displayName: null };

describe("loginRequest", () => {
  test("успех: возвращает токен и пользователя как есть", async () => {
    const { client } = clientAnswering(() =>
      json(200, { accessToken: "a1", tokenType: "Bearer", expiresIn: 900, user: USER }),
    );

    const response = await loginRequest(client, { email: "imam@example.ru", password: "секрет-пароль" });

    assert.deepEqual(response, { accessToken: "a1", tokenType: "Bearer", expiresIn: 900, user: USER });
  });

  test("e-mail обрезается и приводится к нижнему регистру, пароль — нет", async () => {
    const { client, sent } = clientAnswering(() => json(200, { accessToken: "a1", user: USER }));

    await loginRequest(client, { email: "  Imam@Example.RU ", password: " Пароль С Пробелами " });

    assert.equal(sent.length, 1);
    assert.equal(sent[0]?.url, `${BASE}/admin/auth/login`);
    assert.deepEqual(sent[0]?.body, { email: "imam@example.ru", password: " Пароль С Пробелами " });
  });

  test("401 — «Неверная почта или пароль», без refresh", async () => {
    const { client, sent } = clientAnswering(() => json(401, { message: "Неверный e-mail или пароль" }));

    const error = await rejection(loginRequest(client, { email: "a@b.ru", password: "x" }));

    assert.equal(error.status, 401);
    assert.deepEqual(error.messages, [WRONG_CREDENTIALS]);
    assert.equal(sent.length, 1, "на 401 входа refresh не делается");
  });

  test("429 — текст про лимит попыток", async () => {
    const { client } = clientAnswering(() => json(429, { message: "ThrottlerException" }));

    const error = await rejection(loginRequest(client, { email: "a@b.ru", password: "x" }));

    assert.equal(error.status, 429);
    assert.match(error.message, /Слишком много попыток/);
  });

  test("сеть недоступна — NETWORK_ERROR_STATUS", async () => {
    const { client } = clientAnswering(() => {
      throw new TypeError("Failed to fetch");
    });

    const error = await rejection(loginRequest(client, { email: "a@b.ru", password: "x" }));

    assert.equal(error.status, NETWORK_ERROR_STATUS);
    assert.match(error.message, /Нет связи с сервером/);
  });
});

describe("safeNextPath — куда вернуть после входа", () => {
  test("внутренние пути кабинета, с query", () => {
    assert.equal(safeNextPath("/admin/donations"), "/admin/donations");
    assert.equal(safeNextPath("/admin/donations?status=paid&page=2"), "/admin/donations?status=paid&page=2");
    assert.equal(safeNextPath("/admin"), "/admin");
  });

  test("чужое и опасное — на главную кабинета", () => {
    for (const raw of [
      null,
      "",
      "https://evil.example/admin",
      "//evil.example/admin",
      "/\\evil.example",
      "/admin\\..\\x",
      "/admin/../oferta",
      "/admin/./users",
      "javascript:alert(1)",
      "/oferta",
      "/administrator",
      "/admin/login",
      "/admin/login?next=/admin",
      " /admin/users",
    ]) {
      assert.equal(safeNextPath(raw), "/admin", String(raw));
    }
  });
});

describe("loginHref — вход с возвратом", () => {
  test("кодирует путь в next; главная кабинета — без next", () => {
    assert.equal(loginHref("/admin/donations?status=paid"), "/admin/login?next=%2Fadmin%2Fdonations%3Fstatus%3Dpaid");
    assert.equal(loginHref("/admin"), "/admin/login");
    assert.equal(loginHref("/elsewhere"), "/admin/login");
  });
});
