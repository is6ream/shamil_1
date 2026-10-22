import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { charCounter } from "./char-counter";

describe("charCounter", () => {
  test("показывает сколько набрано из скольких", () => {
    assert.deepEqual(charCounter("Фундамент", 160), { text: "9 / 160", isNear: false });
  });

  test("предупреждает с 90% лимита", () => {
    assert.equal(charCounter("x".repeat(143), 160)?.isNear, false);
    assert.equal(charCounter("x".repeat(144), 160)?.isNear, true);
    assert.equal(charCounter("x".repeat(160), 160)?.isNear, true);
  });

  test("считает так же, как ограничивает браузер (maxLength — в единицах UTF-16)", () => {
    assert.equal(charCounter("ﷺ", 10)?.text, "1 / 10");
    assert.equal(charCounter("😊", 10)?.text, "2 / 10");
  });

  test("лимит не задан или не число — счётчика нет", () => {
    assert.equal(charCounter("abc", undefined), null);
    assert.equal(charCounter("abc", 0), null);
  });
});
