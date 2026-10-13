import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { barRatios, fillDays, resolvePeriod } from "./dashboard";

describe("resolvePeriod", () => {
  const now = Date.parse("2026-10-09T20:00:00Z"); // 10.10 01:00 по Уфе

  test("7 дней по Уфе, конец — начало завтрашнего дня", () => {
    const result = resolvePeriod({ preset: "7", from: "", to: "" }, now);

    assert.ok(result.ok);
    assert.equal(result.period.fromDay, "2026-10-04");
    assert.equal(result.period.toDay, "2026-10-10");
    assert.deepEqual(result.period.params, { from: "2026-10-03T19:00:00.000Z", to: "2026-10-10T19:00:00.000Z" });
  });

  test("свой период длиннее 366 дней — подсказка до запроса", () => {
    const result = resolvePeriod({ preset: "custom", from: "2025-01-01", to: "2026-01-02" }, now);

    assert.ok(!result.ok && result.error.includes("366"));
  });

  test("свой период ровно 366 дней проходит", () => {
    assert.ok(resolvePeriod({ preset: "custom", from: "2025-01-01", to: "2026-01-01" }, now).ok);
  });

  test("незаполненный свой период", () => {
    assert.equal(resolvePeriod({ preset: "custom", from: "", to: "2026-01-01" }, now).ok, false);
  });
});

describe("график по дням", () => {
  test("пропущенные дни — нули", () => {
    const days = fillDays([{ date: "2026-10-02", totalKopecks: "500", count: 1 }], "2026-10-01", "2026-10-03");

    assert.deepEqual(
      days.map((day) => [day.date, day.totalKopecks]),
      [
        ["2026-10-01", "0"],
        ["2026-10-02", "500"],
        ["2026-10-03", "0"],
      ],
    );
  });

  test("высоты от максимума, без поступлений — нули", () => {
    assert.deepEqual(
      barRatios([
        { date: "a", totalKopecks: "100", count: 1 },
        { date: "b", totalKopecks: "400", count: 1 },
      ]),
      [0.25, 1],
    );
    assert.deepEqual(barRatios([{ date: "a", totalKopecks: "0", count: 0 }]), [0]);
  });
});
