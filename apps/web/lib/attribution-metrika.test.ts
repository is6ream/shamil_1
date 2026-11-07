import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { buildCreateDonationBody } from "./api/donation-body";
import type { DonationDraft } from "./api/donation-body";
import {
  YCLID_MAX_AGE_S,
  planAttributionCookies,
  readUtmParams,
  readYclid,
  toDonationAttribution,
  withVisitIdentifiers,
} from "./attribution";
import type { LandingContext } from "./attribution";

/**
 * Атрибуция под Яндекс Метрику: yclid, ClientID и граничные случаи меток,
 * которые требует сценарий сквозного учёта по UTM.
 */

const ORIGIN = "https://mechetshamil.ru";
const NOW = new Date("2026-10-27T12:00:00.000Z");

function context(overrides: Partial<LandingContext> = {}): LandingContext {
  return { search: "", pathname: "/", referrer: "", origin: ORIGIN, now: NOW, ...overrides };
}

const DRAFT: DonationDraft = {
  amountRubles: 100,
  isAnonymous: true,
  donorName: "",
  fullName: "",
  phone: "",
  personalDataConsent: false,
  regionSlug: "",
  regionSource: "form",
  antispam: "",
  channel: "online",
};

describe("UTM: граничные случаи", () => {
  test("все пять меток, края обрезаны, регистр сохраняется до бэкенда", () => {
    // Act
    const utm = readUtmParams(
      "?utm_source= VK &utm_medium=Social&utm_campaign=ramadan_2026&utm_content=banner-1&utm_term=мечеть",
    );

    // Assert
    assert.deepEqual(utm, {
      source: "VK",
      medium: "Social",
      campaign: "ramadan_2026",
      content: "banner-1",
      term: "мечеть",
    });
  });

  test("кириллица в %-кодировке декодируется", () => {
    assert.deepEqual(readUtmParams("?utm_campaign=%D1%80%D0%B0%D0%BC%D0%B0%D0%B4%D0%B0%D0%BD"), {
      campaign: "рамадан",
    });
  });

  test("пустые, слишком длинные и с e-mail — отбрасываются, остальные остаются", () => {
    // Act
    const utm = readUtmParams(
      `?utm_source=&utm_medium=${"x".repeat(129)}&utm_campaign=a%40b.ru&utm_content=ba%0Ad&utm_term=ok`,
    );

    // Assert
    assert.deepEqual(utm, { term: "ok" });
  });

  test("внутренний переход без меток не трогает last-touch, новый заход с метками — перезаписывает", () => {
    // Act
    const internal = planAttributionCookies(context({ search: "" }), JSON.stringify({ source: "vk" }));
    const fresh = planAttributionCookies(
      context({ search: "?utm_source=telegram" }),
      JSON.stringify({ source: "vk" }),
    );

    // Assert
    assert.equal(internal.lastTouch, undefined);
    assert.equal(internal.firstTouch, undefined);
    assert.equal(fresh.lastTouch, JSON.stringify({ source: "telegram" }));
    assert.equal(fresh.firstTouch, undefined, "first-touch не перезаписывается");
  });

  test("битая cookie не ломает разбор: атрибуции просто нет", () => {
    assert.equal(toDonationAttribution("{not json", "%%%"), null);
  });
});

describe("yclid", () => {
  test("только цифры", () => {
    assert.equal(readYclid("?yclid=5207465128348827647"), "5207465128348827647");
    assert.equal(readYclid("?yclid=abc"), null);
    assert.equal(readYclid(`?yclid=${"1".repeat(65)}`), null);
    assert.equal(readYclid("?utm_source=vk"), null);
  });

  test("proxy ставит cookie yclid и без UTM, last-touch при этом не трогает", () => {
    // Act
    const plan = planAttributionCookies(context({ search: "?yclid=123" }), JSON.stringify({ source: "vk" }));

    // Assert
    assert.equal(plan.yclid, "123");
    assert.equal(plan.lastTouch, undefined);
  });

  test("срок cookie — 21 день, окно сопоставления офлайн-конверсий", () => {
    assert.equal(YCLID_MAX_AGE_S, 21 * 24 * 60 * 60);
  });
});

describe("withVisitIdentifiers", () => {
  test("добавляет ClientID и yclid к атрибуции", () => {
    // Act
    const result = withVisitIdentifiers({ first: { source: "vk" } }, { ymClientId: "1729", yclid: "42" });

    // Assert
    assert.deepEqual(result, { first: { source: "vk" }, ymClientId: "1729", yclid: "42" });
  });

  test("без cookie меток, но с ClientID — атрибуция из одного ClientID", () => {
    assert.deepEqual(withVisitIdentifiers(null, { ymClientId: "1729" }), { ymClientId: "1729" });
  });

  test("не по формату — не отправляется, атрибуция без изменений", () => {
    // Arrange
    const attribution = { first: { source: "vk" } };

    // Act + Assert
    assert.equal(withVisitIdentifiers(attribution, { ymClientId: "abc", yclid: "1,2" }), attribution);
    assert.equal(withVisitIdentifiers(null, { ymClientId: null, yclid: undefined }), null);
  });

  test("попадает в тело POST /donations полем attribution", () => {
    // Act
    const body = buildCreateDonationBody(
      DRAFT,
      withVisitIdentifiers({ last: { source: "vk", medium: "social", campaign: "ramadan_2026" } }, { ymClientId: "1729" }),
    );

    // Assert
    assert.deepEqual(body.attribution, {
      last: { source: "vk", medium: "social", campaign: "ramadan_2026" },
      ymClientId: "1729",
    });
  });
});
