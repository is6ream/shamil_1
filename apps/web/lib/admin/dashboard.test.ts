import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { barRatios, fillDays, groupByMonth, monthLabel, resolveMonths, resolvePeriod } from "./dashboard";

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

describe("помесячный график", () => {
  const now = Date.parse("2026-10-20T20:00:00Z"); // 21.10 01:00 по Уфе

  test("3 месяца: с 1-го числа позапрошлого месяца по сегодня", () => {
    const period = resolveMonths(3, now);

    assert.equal(period.fromDay, "2026-08-01");
    assert.equal(period.toDay, "2026-10-21");
    assert.deepEqual(period.params, { from: "2026-07-31T19:00:00.000Z", to: "2026-10-21T19:00:00.000Z" });
  });

  test("12 месяцев переходят через год и укладываются в лимит API", () => {
    const period = resolveMonths(12, now);

    assert.equal(period.fromDay, "2025-11-01");
    assert.equal(period.toDay, "2026-10-21");
  });

  test("12 месяцев в последний день високосного февраля — ровно 366 дней", () => {
    const period = resolveMonths(12, Date.parse("2028-02-29T12:00:00Z"));

    assert.equal(period.fromDay, "2027-03-01");
    assert.equal(period.toDay, "2028-02-29");
  });

  test("суммы складываются по месяцам без потери копеек, пустые месяцы — нули", () => {
    const months = groupByMonth(
      [
        { date: "2026-08-31", totalKopecks: "9007199254740993", count: 1 },
        { date: "2026-10-01", totalKopecks: "150", count: 2 },
        { date: "2026-10-21", totalKopecks: "50", count: 1 },
      ],
      "2026-08-01",
      "2026-10-21",
    );

    assert.deepEqual(months, [
      { date: "2026-08", totalKopecks: "9007199254740993", count: 1 },
      { date: "2026-09", totalKopecks: "0", count: 0 },
      { date: "2026-10", totalKopecks: "200", count: 3 },
    ]);
  });

  test("дни за пределами периода не попадают в месяцы", () => {
    const months = groupByMonth([{ date: "2026-07-31", totalKopecks: "100", count: 1 }], "2026-08-01", "2026-08-31");

    assert.deepEqual(months, [{ date: "2026-08", totalKopecks: "0", count: 0 }]);
  });

  test("подписи месяцев по-русски", () => {
    assert.equal(monthLabel("2026-10"), "октябрь 2026");
    assert.equal(monthLabel("2026-01", "short"), "янв");
  });
});
