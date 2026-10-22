import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { easeOutCubic, formatRubles, goalSummaryText, kopecksToWholeRubles, parseActiveGoal } from "./goal-progress";

const VALID = {
  id: "466113c2-dc61-4b9c-9289-aed9f65e1b13",
  title: "На кирпичи",
  description: null,
  targetAmountKopecks: "70000000",
  collectedAmountKopecks: "24500000",
  percent: 35,
  isReached: false,
} as const;

describe("parseActiveGoal", () => {
  test("правильный ответ проходит как есть", () => {
    assert.deepEqual(parseActiveGoal(VALID), VALID);
  });

  test("пустой ответ API (этапа нет) — null", () => {
    assert.equal(parseActiveGoal(null), null);
    assert.equal(parseActiveGoal(""), null);
  });

  test("битые поля — null, а не кривые цифры на главной", () => {
    for (const broken of [
      { ...VALID, targetAmountKopecks: 70000000 },
      { ...VALID, targetAmountKopecks: "0" },
      { ...VALID, collectedAmountKopecks: "-1" },
      { ...VALID, percent: 35.5 },
      { ...VALID, title: "   " },
      { ...VALID, description: 42 },
      { ...VALID, isReached: "no" },
      [VALID],
    ]) {
      assert.equal(parseActiveGoal(broken), null, JSON.stringify(broken));
    }
  });

  test("процент вне 0–100 обрезается", () => {
    assert.equal(parseActiveGoal({ ...VALID, percent: 140 })?.percent, 100);
  });
});

describe("форматирование", () => {
  test("рубли по-русски, без копеек, пробелы неразрывные", () => {
    assert.equal(formatRubles(700000), "700 000 ₽");
    assert.equal(formatRubles(0), "0 ₽");
  });

  test("копейки отбрасываются, точность bigint сохраняется", () => {
    assert.equal(kopecksToWholeRubles("24500099"), 245000);
    assert.equal(kopecksToWholeRubles("10000000000"), 100000000);
  });

  test("строка «Собрано X из Y · N%»", () => {
    assert.equal(goalSummaryText(VALID), "Собрано 245 000 ₽ из 700 000 ₽ · 35%");
  });
});

describe("easeOutCubic", () => {
  test("от 0 до 1, монотонно, за границами обрезается", () => {
    assert.equal(easeOutCubic(0), 0);
    assert.equal(easeOutCubic(1), 1);
    assert.equal(easeOutCubic(2), 1);
    assert.equal(easeOutCubic(-1), 0);
    assert.ok(easeOutCubic(0.5) > 0.5);
  });
});
