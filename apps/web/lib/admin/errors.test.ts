import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { toAdminApiError } from "./errors";
import { can } from "./roles";

describe("toAdminApiError", () => {
  test("400 показывает все сообщения валидации сервера", () => {
    const error = toAdminApiError(400, { message: ["title слишком длинный", "alt обязателен"] });

    assert.deepEqual(error.messages, ["title слишком длинный", "alt обязателен"]);
  });

  test("403 — свой текст вместо «Forbidden resource»", () => {
    const error = toAdminApiError(403, { message: "Forbidden resource" });

    assert.equal(error.message, "Недостаточно прав для этого действия.");
  });

  test("500 не показывает внутренности сервера", () => {
    const error = toAdminApiError(500, { message: "PrismaClientKnownRequestError: ..." });

    assert.ok(!error.message.includes("Prisma"));
  });
});

describe("can (D-06)", () => {
  test("редактор не видит CSV, пользователей и журнал", () => {
    assert.equal(can("EDITOR", "exportCsv"), false);
    assert.equal(can("EDITOR", "users"), false);
    assert.equal(can("EDITOR", "audit"), false);
    assert.equal(can("EDITOR", "content"), true);
  });

  test("бухгалтер вносит наличные, но не правит контент", () => {
    assert.equal(can("ACCOUNTANT", "manualDonations"), true);
    assert.equal(can("ACCOUNTANT", "content"), false);
  });
});
