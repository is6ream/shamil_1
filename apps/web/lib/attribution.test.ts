import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { buildCreateDonationBody } from "./api/donation-body";
import type { DonationDraft } from "./api/donation-body";
import { ATTRIBUTION_COOKIE, buildAttribution, parseAttributionCookie } from "./attribution";

const ORIGIN = "https://mechetshamil.ru";

describe("buildAttribution", () => {
  test("метки, внешний Referer и страница входа", () => {
    // Act
    const utm = buildAttribution({
      search: "?utm_source=vk&utm_medium=social&utm_campaign=рамадан&gclid=x",
      pathname: "/02/",
      referrer: "https://vk.com/feed",
      origin: ORIGIN,
    });

    // Assert
    assert.equal(utm.source, "vk");
    assert.equal(utm.medium, "social");
    assert.equal(utm.campaign, "рамадан");
    assert.equal(utm.referrer, "https://vk.com/feed");
    assert.ok(utm.landingPage?.startsWith("/02/?utm_source=vk"));
  });

  test("свой домен в Referer источником не считается", () => {
    // Act
    const utm = buildAttribution({ search: "", pathname: "/", referrer: `${ORIGIN}/otchety`, origin: ORIGIN });

    // Assert
    assert.equal(utm.referrer, undefined);
    assert.equal(utm.landingPage, "/");
  });

  test("метка с запрещёнными символами или длиннее 128 отбрасывается, донат её не увидит", () => {
    // Act
    const utm = buildAttribution({
      search: `?utm_source=${encodeURIComponent("<script>")}&utm_campaign=${"x".repeat(129)}&utm_term=ok`,
      pathname: "/",
      referrer: "javascript:alert(1)",
      origin: ORIGIN,
    });

    // Assert
    assert.equal(utm.source, undefined);
    assert.equal(utm.campaign, undefined);
    assert.equal(utm.referrer, undefined);
    assert.equal(utm.term, "ok");
  });
});

describe("parseAttributionCookie", () => {
  test("cookie разбирается и проверяется заново", () => {
    // Arrange
    const value = encodeURIComponent(JSON.stringify({ source: "tg", medium: "<b>", evil: "x" }));

    // Act
    const utm = parseAttributionCookie(`other=1; ${ATTRIBUTION_COOKIE}=${value}`);

    // Assert
    assert.deepEqual(utm, { source: "tg" });
  });

  test("испорченная cookie — атрибуции нет, без исключения", () => {
    assert.equal(parseAttributionCookie(`${ATTRIBUTION_COOKIE}=%7Bnot-json`), null);
    assert.equal(parseAttributionCookie("other=1"), null);
  });
});

describe("buildCreateDonationBody: utm", () => {
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

  test("атрибуция уходит полем utm", () => {
    assert.deepEqual(buildCreateDonationBody(draft, { source: "vk" }).utm, { source: "vk" });
  });

  test("пустая атрибуция в тело не попадает", () => {
    assert.equal("utm" in buildCreateDonationBody(draft, {}), false);
    assert.equal("utm" in buildCreateDonationBody(draft), false);
  });
});
