import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { randomUuid } from "./uuid";

const V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe("randomUuid", () => {
  test("v4 и без randomUUID (небезопасный контекст)", () => {
    const original = crypto.randomUUID;

    Object.defineProperty(crypto, "randomUUID", { value: undefined, configurable: true });

    try {
      const first = randomUuid();

      assert.match(first, V4);
      assert.notEqual(first, randomUuid());
    } finally {
      Object.defineProperty(crypto, "randomUUID", { value: original, configurable: true });
    }
  });

  test("v4 с randomUUID", () => {
    assert.match(randomUuid(), V4);
  });
});
