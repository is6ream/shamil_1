import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { buildCreateDonationBody } from "./api/donation-body";
import type { DonationDraft } from "./api/donation-body";
import {
  buildFirstTouch,
  parseFirstTouch,
  parseLastTouch,
  planAttributionCookies,
  readCookie,
  readUtmParams,
  toDonationAttribution,
} from "./attribution";
import type { LandingContext } from "./attribution";

const ORIGIN = "https://mechetshamil.ru";
const NOW = new Date("2026-10-19T12:00:00.000Z");

function context(overrides: Partial<LandingContext> = {}): LandingContext {
  return { search: "", pathname: "/", referrer: "", origin: ORIGIN, now: NOW, ...overrides };
}

describe("buildFirstTouch", () => {
  test("метки, внешний Referer, страница и время входа", () => {
    // Act
    const touch = buildFirstTouch(
      context({
        search: "?utm_source=vk&utm_medium=social&utm_campaign=рамадан&gclid=x",
        pathname: "/02/",
        referrer: "https://vk.com/feed",
      }),
    );

    // Assert
    assert.equal(touch.source, "vk");
    assert.equal(touch.medium, "social");
    assert.equal(touch.campaign, "рамадан");
    assert.equal(touch.referrer, "https://vk.com/feed");
    assert.equal(touch.at, NOW.toISOString());
    assert.ok(touch.landingPage?.startsWith("/02/?utm_source=vk"));
  });

  test("свой домен в Referer источником не считается", () => {
    // Act
    const touch = buildFirstTouch(context({ referrer: `${ORIGIN}/otchety` }));

    // Assert
    assert.equal(touch.referrer, undefined);
    assert.equal(touch.landingPage, "/");
  });

  test("метка с запрещёнными символами, e-mail или длиннее 128 отбрасывается — донат её не увидит", () => {
    // Act
    const touch = buildFirstTouch(
      context({
        search:
          `?utm_source=${encodeURIComponent("<script>")}&utm_campaign=${"x".repeat(129)}` +
          `&utm_content=${encodeURIComponent("a@b.ru")}&utm_term=ok`,
        referrer: "javascript:alert(1)",
      }),
    );

    // Assert
    assert.equal(touch.source, undefined);
    assert.equal(touch.campaign, undefined);
    assert.equal(touch.content, undefined);
    assert.equal(touch.referrer, undefined);
    assert.equal(touch.term, "ok");
  });
});

describe("readUtmParams", () => {
  test("без меток — null: last-touch не обновляется", () => {
    assert.equal(readUtmParams("?page=2"), null);
    assert.equal(readUtmParams(""), null);
  });
});

describe("planAttributionCookies", () => {
  test("первый визит без меток: first-touch пишется, last-touch нет", () => {
    // Act
    const plan = planAttributionCookies(context({ referrer: "https://t.me/" }), undefined);

    // Assert
    assert.deepEqual(JSON.parse(plan.firstTouch ?? "{}"), {
      referrer: "https://t.me/",
      landingPage: "/",
      at: NOW.toISOString(),
    });
    assert.equal(plan.lastTouch, undefined);
  });

  test("повторный заход с метками: first-touch не трогаем, last-touch обновляем", () => {
    // Arrange
    const existing = JSON.stringify({ source: "telegram", at: "2026-10-01T10:00:00.000Z" });

    // Act
    const plan = planAttributionCookies(context({ search: "?utm_source=instagram&utm_medium=stories" }), existing);

    // Assert
    assert.equal(plan.firstTouch, undefined);
    assert.deepEqual(JSON.parse(plan.lastTouch ?? "{}"), { source: "instagram", medium: "stories" });
  });

  test("повторный прямой заход ничего не пишет", () => {
    // Act
    const plan = planAttributionCookies(context(), JSON.stringify({ landingPage: "/" }));

    // Assert
    assert.deepEqual(plan, {});
  });

  test("испорченная first-touch перезаписывается, а не ломает атрибуцию", () => {
    // Act
    const plan = planAttributionCookies(context({ search: "?utm_source=qr" }), "{not-json");

    // Assert
    assert.equal(JSON.parse(plan.firstTouch ?? "{}").source, "qr");
  });
});

describe("разбор cookie", () => {
  test("first-touch проверяется заново: чужие ключи и опасные значения выброшены", () => {
    // Act
    const touch = parseFirstTouch(
      JSON.stringify({ source: "tg", medium: "<b>", evil: "x", at: "вчера", landingPage: "https://evil" }),
    );

    // Assert
    assert.deepEqual(touch, { source: "tg" });
  });

  test("first-touch прежнего формата (без at) принимается", () => {
    assert.deepEqual(parseFirstTouch(JSON.stringify({ source: "vk", landingPage: "/" })), {
      source: "vk",
      landingPage: "/",
    });
  });

  test("испорченная cookie — атрибуции нет, без исключения", () => {
    assert.equal(parseFirstTouch("{not-json"), null);
    assert.equal(parseFirstTouch("[1,2]"), null);
    assert.equal(parseLastTouch(JSON.stringify({ evil: "x" })), null);
  });

  test("readCookie декодирует значение и не падает на битой кодировке", () => {
    // Arrange
    const value = encodeURIComponent(JSON.stringify({ source: "tg" }));

    // Act & Assert
    assert.equal(readCookie(`other=1; shamil_ft=${value}`, "shamil_ft"), '{"source":"tg"}');
    assert.equal(readCookie("shamil_ft=%E0%A4%A", "shamil_ft"), undefined);
    assert.equal(readCookie("other=1", "shamil_ft"), undefined);
  });
});

describe("toDonationAttribution", () => {
  test("first и last собираются в тело доната", () => {
    // Act
    const attribution = toDonationAttribution(
      JSON.stringify({ campaign: "oct", referrer: "https://t.me/", landingPage: "/", at: NOW.toISOString() }),
      JSON.stringify({ source: "qr", medium: "offline" }),
    );

    // Assert
    assert.deepEqual(attribution, {
      first: { campaign: "oct" },
      last: { source: "qr", medium: "offline" },
      referrer: "https://t.me/",
      landingPage: "/",
      firstTouchAt: NOW.toISOString(),
    });
  });

  test("без cookie — null", () => {
    assert.equal(toDonationAttribution(undefined, undefined), null);
  });
});

describe("buildCreateDonationBody: атрибуция", () => {
  const draft: DonationDraft = {
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

  test("атрибуция уходит полем attribution, старого utm в теле нет", () => {
    // Act
    const body = buildCreateDonationBody(draft, { first: { source: "vk" } });

    // Assert
    assert.deepEqual(body.attribution, { first: { source: "vk" } });
    assert.equal("utm" in body, false);
  });

  test("пустая атрибуция в тело не попадает", () => {
    assert.equal("attribution" in buildCreateDonationBody(draft, {}), false);
    assert.equal("attribution" in buildCreateDonationBody(draft), false);
  });

  test("«откуда узнали» уходит только с переводом по реквизитам", () => {
    assert.equal(buildCreateDonationBody({ ...draft, channel: "transfer", howDidYouHear: "mosque" }).howDidYouHear, "mosque");
    assert.equal("howDidYouHear" in buildCreateDonationBody({ ...draft, howDidYouHear: "mosque" }), false);
  });
});
