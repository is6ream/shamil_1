import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { dayLabel, groupByDay, methodLabel, ufaDay } from "./history";
import type { DonorHistoryItem } from "./types";

/** 27.10.2026, 15:00 по Уфе. */
const NOW = Date.parse("2026-10-27T10:00:00Z");

function item(id: string, paidAt: string, amountKopecks: string, status: "paid" | "failed" = "paid"): DonorHistoryItem {
  return { id, createdAt: paidAt, paidAt: status === "paid" ? paidAt : null, amountKopecks, method: "sbp", kind: "ONE_TIME", status };
}

describe("ufaDay", () => {
  test("день считается по Уфе: 20:30 UTC — уже следующее число", () => {
    assert.equal(ufaDay("2026-10-26T20:30:00Z"), "2026-10-27");
  });
});

describe("dayLabel", () => {
  test("сегодня, вчера и короткая дата", () => {
    assert.equal(dayLabel("2026-10-27", NOW), "Сегодня");
    assert.equal(dayLabel("2026-10-26", NOW), "Вчера");
    assert.equal(dayLabel("2026-10-25", NOW), "25 окт");
  });

  test("прошлый год — с годом", () => {
    assert.equal(dayLabel("2025-03-08", NOW), "8 мар 2025");
  });
});

describe("groupByDay", () => {
  test("склеивает строки одного дня по Уфе и считает только успешные", () => {
    // Arrange
    const items = [
      item("a", "2026-10-27T05:00:00Z", "10000"),
      item("b", "2026-10-26T20:30:00Z", "50000", "failed"),
      item("c", "2026-10-26T18:00:00Z", "20000"),
    ];

    // Act
    const days = groupByDay(items);

    // Assert
    assert.deepEqual(
      days.map((day) => [day.day, day.items.map((row) => row.id), day.paidTotalKopecks]),
      [
        ["2026-10-27", ["a", "b"], 10000n],
        ["2026-10-26", ["c"], 20000n],
      ],
    );
  });

  test("пустая история — пустой список", () => {
    assert.deepEqual(groupByDay([]), []);
  });
});

describe("methodLabel", () => {
  test("известные способы по-русски, неизвестный — не код бэкенда", () => {
    assert.equal(methodLabel("card"), "Банковская карта");
    assert.equal(methodLabel("bank_transfer"), "Расчётный счёт");
    assert.equal(methodLabel("crypto"), "Другой способ");
    assert.equal(methodLabel(null), "—");
  });
});
