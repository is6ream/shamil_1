import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { EMPTY_DONATION_FILTERS } from "./donations";
import { activePreset, clearChip, filterChips, presetRange } from "./donation-filter-chips";

// 22.10.2026, 02:30 по Уфе (21.10 21:30 UTC): день по Уфе уже 22-е.
const NOW = Date.parse("2026-10-21T21:30:00Z");
const regionName = (slug: string) => ({ "02": "Башкортостан" })[slug] ?? null;
// Intl ставит неразрывные пробелы в разряды — в ожиданиях пишем обычные.
const plain = (text: string) => text.replace(/[  ]/g, " ");

describe("presetRange", () => {
  test("сегодня и 7 дней считаются по Уфе, оба конца включительно", () => {
    assert.deepEqual(presetRange("today", NOW), { from: "2026-10-22", to: "2026-10-22" });
    assert.deepEqual(presetRange("week", NOW), { from: "2026-10-16", to: "2026-10-22" });
  });

  test("этот и прошлый месяц, год", () => {
    assert.deepEqual(presetRange("month", NOW), { from: "2026-10-01", to: "2026-10-22" });
    assert.deepEqual(presetRange("lastMonth", NOW), { from: "2026-09-01", to: "2026-09-30" });
    assert.deepEqual(presetRange("year", NOW), { from: "2026-01-01", to: "2026-10-22" });
  });

  test("прошлый месяц в январе — декабрь прошлого года", () => {
    assert.deepEqual(presetRange("lastMonth", Date.parse("2027-01-10T10:00:00Z")), {
      from: "2026-12-01",
      to: "2026-12-31",
    });
  });
});

describe("activePreset", () => {
  test("узнаёт пресет по датам, иначе — свой диапазон или ничего", () => {
    assert.equal(activePreset({ from: "2026-09-01", to: "2026-09-30" }, NOW), "lastMonth");
    assert.equal(activePreset({ from: "2026-09-02", to: "2026-09-30" }, NOW), "custom");
    assert.equal(activePreset({ from: "", to: "" }, NOW), null);
  });
});

describe("filterChips", () => {
  test("без фильтров — пусто; сортировка — не фильтр", () => {
    assert.deepEqual(filterChips({ ...EMPTY_DONATION_FILTERS, sort: "amount" }, regionName), []);
  });

  test("подписи по-человечески, период и сумма — одной плашкой", () => {
    const chips = filterChips(
      {
        ...EMPTY_DONATION_FILTERS,
        status: "paid",
        from: "2026-10-01",
        to: "2026-10-20",
        dateField: "paid",
        method: "sbp",
        minRubles: "100",
        maxRubles: "5000",
        regionSlug: "02",
        utmSource: "telegram",
        q: "Иванов",
      },
      regionName,
    );

    assert.deepEqual(
      chips.map((chip) => plain(chip.label)),
      [
        "Поиск: «Иванов»",
        "Оплачено",
        "Оплачены 01.10.2026 – 20.10.2026",
        "СБП",
        "От 100 ₽ до 5 000 ₽",
        "Регион: Башкортостан",
        "utm_source: telegram",
      ],
    );
  });

  test("открытый период и одна граница суммы", () => {
    const labels = filterChips(
      { ...EMPTY_DONATION_FILTERS, from: "2026-10-01", maxRubles: "1000,5" },
      regionName,
    ).map((chip) => plain(chip.label));

    assert.deepEqual(labels, ["С 01.10.2026", "До 1 000,50 ₽"]);
  });

  test("неизвестный регион — по коду", () => {
    assert.deepEqual(
      filterChips({ ...EMPTY_DONATION_FILTERS, regionSlug: "kz" }, regionName).map((chip) => plain(chip.label)),
      ["Регион: kz"],
    );
  });
});

describe("clearChip", () => {
  test("снимает только свой фильтр, период и сумму — целиком", () => {
    const filters = {
      ...EMPTY_DONATION_FILTERS,
      status: "paid" as const,
      from: "2026-10-01",
      to: "2026-10-20",
      dateField: "paid" as const,
      minRubles: "1",
      maxRubles: "2",
    };

    assert.deepEqual(clearChip(filters, "period"), {
      ...filters,
      from: "",
      to: "",
      dateField: "created",
    });
    assert.deepEqual(clearChip(filters, "amount"), { ...filters, minRubles: "", maxRubles: "" });
    assert.deepEqual(clearChip(filters, "status"), { ...filters, status: "" });
  });
});
