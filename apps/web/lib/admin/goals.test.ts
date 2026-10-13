import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { changedGoalFields, checkMonthlyGoal, monthBounds } from "./goals";

describe("checkMonthlyGoal", () => {
  test("даты как есть, сумма в копейках", () => {
    assert.deepEqual(checkMonthlyGoal({ periodStart: "2026-11-01", periodEnd: "2026-11-30", amount: "5 000 000" }), {
      ok: true,
      body: { periodStart: "2026-11-01", periodEnd: "2026-11-30", goalKopecks: "500000000" },
    });
  });

  test("конец раньше начала и пустая сумма", () => {
    const result = checkMonthlyGoal({ periodStart: "2026-11-10", periodEnd: "2026-11-01", amount: "" });

    assert.ok(!result.ok && result.errors.periodEnd && result.errors.amount);
  });

  test("один день — допустимый период", () => {
    assert.ok(checkMonthlyGoal({ periodStart: "2026-11-01", periodEnd: "2026-11-01", amount: "1" }).ok);
  });
});

describe("monthBounds", () => {
  test("февраль високосного и обычного года", () => {
    assert.deepEqual(monthBounds("2028-02-10"), { start: "2028-02-01", end: "2028-02-29" });
    assert.deepEqual(monthBounds("2026-02-10"), { start: "2026-02-01", end: "2026-02-28" });
  });
});

describe("changedGoalFields", () => {
  test("в PATCH только изменённое", () => {
    const before = { periodStart: "2026-11-01", periodEnd: "2026-11-30", goalKopecks: "100" };

    assert.deepEqual(changedGoalFields(before, { ...before, goalKopecks: "200" }), { goalKopecks: "200" });
  });
});
