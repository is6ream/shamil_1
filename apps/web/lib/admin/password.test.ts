import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { generatePassword, passwordProblem, passwordStrength } from "./password";

describe("пароль", () => {
  test("12 символов — минимум", () => {
    assert.notEqual(passwordProblem("a".repeat(11)), null);
    assert.equal(passwordProblem("a".repeat(12)), null);
  });

  test("72 байта: 36 кириллических букв проходят, 37 — нет", () => {
    assert.equal(passwordProblem("я".repeat(36)), null);
    assert.notEqual(passwordProblem("я".repeat(37)), null);
  });

  test("индикатор", () => {
    assert.equal(passwordStrength("short"), "short");
    assert.equal(passwordStrength("a".repeat(13)), "ok");
    assert.equal(passwordStrength("a".repeat(20)), "good");
    assert.equal(passwordStrength("я".repeat(40)), "long");
  });

  test("сгенерированный пароль проходит политику", () => {
    const password = generatePassword();

    assert.equal(password.length, 16);
    assert.equal(passwordProblem(password), null);
    assert.match(password, /^[A-Za-z2-9]+$/);
  });
});
