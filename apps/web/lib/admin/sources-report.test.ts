import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { sourceRowKey } from "./attribution";
import { dimensionsOf, kopecksToCsvRubles, shareOfTotal, sourcesReportCsv, sourcesReportFileName } from "./sources-report";
import type { DonationsBySource } from "./types";

const REPORT: DonationsBySource = {
  period: { from: "2026-10-01T00:00:00.000Z", to: "2026-10-27T00:00:00.000Z" },
  model: "last",
  groupBy: "medium",
  rows: [
    { source: "vk", medium: "social", count: 2, totalKopecks: "60000", averageKopecks: "30000" },
    { source: "=cmd", medium: null, count: 1, totalKopecks: "10000", averageKopecks: "10000" },
  ],
  unattributed: { count: 1, totalKopecks: "30000", averageKopecks: "30000" },
  total: { count: 4, totalKopecks: "100000", averageKopecks: "25000" },
};

describe("доля от суммы", () => {
  test("проценты с одним знаком, округление к ближайшему", () => {
    assert.equal(shareOfTotal("60000", "100000"), "60,0 %");
    assert.equal(shareOfTotal("1", "3"), "33,3 %");
    assert.equal(shareOfTotal("2", "3"), "66,7 %");
    assert.equal(shareOfTotal("100000", "100000"), "100,0 %");
  });

  test("пустой период — 0, без деления на ноль", () => {
    assert.equal(shareOfTotal("0", "0"), "0,0 %");
  });
});

describe("CSV отчёта", () => {
  test("BOM, `;`, CRLF, суммы с запятой, строки «без атрибуции» и «Итого»", () => {
    // Act
    const csv = sourcesReportCsv(REPORT);
    const lines = csv.slice(1).split("\r\n");

    // Assert
    assert.equal(csv[0], "﻿");
    assert.deepEqual(lines, [
      "Источник;Канал;Пожертвований;Сумма, ₽;Средний чек, ₽;Доля",
      "ВКонтакте;social;2;600,00;300,00;60,0 %",
      "'=cmd;;1;100,00;100,00;10,0 %",
      "(без атрибуции);;1;300,00;300,00;30,0 %",
      "Итого;;4;1000,00;250,00;100,0 %",
      "",
    ]);
  });

  test("разрез «откуда узнали» — своя подпись колонки", () => {
    const csv = sourcesReportCsv({ ...REPORT, groupBy: "how_did_you_hear", rows: [] });

    assert.ok(csv.startsWith("﻿Откуда узнали;Пожертвований"));
  });

  test("имя файла — модель, разрез и период", () => {
    assert.equal(sourcesReportFileName(REPORT), "istochniki_last_medium_2026-10-01_2026-10-27.csv");
  });

  test("копейки → рубли с запятой", () => {
    assert.equal(kopecksToCsvRubles("5"), "0,05");
    assert.equal(kopecksToCsvRubles("-150"), "-1,50");
  });
});

describe("разрезы", () => {
  test("колонки каждого разреза", () => {
    assert.deepEqual(dimensionsOf("source"), []);
    assert.deepEqual(dimensionsOf("medium"), ["medium"]);
    assert.deepEqual(dimensionsOf("campaign"), ["campaign"]);
    assert.deepEqual(dimensionsOf("content"), ["campaign", "content"]);
    assert.deepEqual(dimensionsOf("how_did_you_hear"), []);
  });

  test("vk/social и vk/cpc — разные ключи строк", () => {
    const base = { source: "vk", count: 1, totalKopecks: "1", averageKopecks: "1" };

    assert.notEqual(sourceRowKey({ ...base, medium: "social" }), sourceRowKey({ ...base, medium: "cpc" }));
  });
});
