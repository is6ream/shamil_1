import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  EMPTY_SHORT_LINK_FORM,
  checkShortLinkForm,
  sourceLabel,
  sourceRowKey,
  sourcesReportPath,
} from "./attribution";
import type { ShortLinkForm } from "./attribution";

const VALID: ShortLinkForm = {
  ...EMPTY_SHORT_LINK_FORM,
  slug: "banner-mosque",
  title: " Баннер у входа ",
  utmSource: " QR ",
  utmMedium: "Offline",
};

describe("checkShortLinkForm", () => {
  test("метки нормализуются так же, как на сервере, пустые — null", () => {
    // Act
    const check = checkShortLinkForm(VALID, true);

    // Assert
    assert.ok(check.ok);
    assert.deepEqual(check.body, {
      slug: "banner-mosque",
      title: "Баннер у входа",
      targetPath: "/",
      utmSource: "qr",
      utmMedium: "offline",
      utmCampaign: null,
      utmContent: null,
      utmTerm: null,
      isActive: true,
    });
  });

  test("при правке слаг не проверяется и в тело не уходит: он уже напечатан", () => {
    // Act
    const check = checkShortLinkForm({ ...VALID, slug: "" }, false);

    // Assert
    assert.ok(check.ok);
    assert.equal("slug" in check.body, false);
  });

  test("пустой путь — главная", () => {
    const check = checkShortLinkForm({ ...VALID, targetPath: "  " }, true);

    assert.ok(check.ok);
    assert.equal(check.body.targetPath, "/");
  });

  for (const [field, value] of [
    ["slug", "Banner"],
    ["slug", "a--b"],
    ["targetPath", "//evil.example"],
    ["targetPath", "https://evil.example/"],
    ["targetPath", "/?utm_source=x"],
    ["utmSource", ""],
    ["utmCampaign", "mail@example.com"],
    ["utmContent", "<b>"],
    ["title", "   "],
  ] as const) {
    test(`${field} = «${value}» — ошибка у поля`, () => {
      // Act
      const check = checkShortLinkForm({ ...VALID, [field]: value }, true);

      // Assert
      assert.equal(check.ok, false);
      assert.ok(!check.ok && check.errors[field] !== undefined);
    });
  }
});

describe("отчёт по источникам", () => {
  test("подписи: известные источники по-русски, свои метки — как есть", () => {
    assert.equal(sourceLabel("direct", "source"), "Прямой заход");
    assert.equal(sourceLabel("islam-today.ru", "source"), "islam-today.ru");
    assert.equal(sourceLabel("mosque", "how_did_you_hear"), "В мечети, от имама");
  });

  test("ключ строки различает кампании одного источника", () => {
    assert.notEqual(
      sourceRowKey({ source: "tg", campaign: "a", count: 1, totalKopecks: "1", averageKopecks: "1" }),
      sourceRowKey({ source: "tg", campaign: "b", count: 1, totalKopecks: "1", averageKopecks: "1" }),
    );
  });

  test("путь запроса несёт период, модель и разрез", () => {
    assert.equal(
      sourcesReportPath({ from: "2026-10-01T00:00:00.000Z", to: "2026-10-02T00:00:00.000Z" }, "first", "campaign"),
      "/admin/analytics/donations-by-source?from=2026-10-01T00%3A00%3A00.000Z&to=2026-10-02T00%3A00%3A00.000Z&model=first&groupBy=campaign",
    );
  });
});
