import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  CONSENT_COOKIE,
  CONSENT_MAX_AGE_S,
  createConsentStore,
  isAnalyticsAllowed,
  parseConsent,
  serializeConsentCookie,
} from "./consent";
import type { CookieJar } from "./consent";
import { sanitizeGoalParams } from "./goals";
import { createOncePerVisit } from "./once-per-visit";
import type { VisitStorage } from "./once-per-visit";
import { buildPageUrl, createPageviewTracker } from "./pageview";
import { isTrackedPath } from "./tracked-paths";

describe("хиты при смене маршрута", () => {
  test("ровно один хит на навигацию, повтор того же адреса (Strict Mode) — пропуск", () => {
    // Arrange
    const hits: [string, string | undefined][] = [];
    const tracker = createPageviewTracker((url, referer) => hits.push([url, referer]));

    // Act: первая загрузка, повтор эффекта, переход, возврат
    tracker.track("https://s.ru/?utm_source=vk", "https://vk.com/");
    tracker.track("https://s.ru/?utm_source=vk", "https://vk.com/");
    tracker.track("https://s.ru/galereya", "https://vk.com/");
    tracker.track("https://s.ru/", "https://vk.com/");

    // Assert
    assert.deepEqual(hits, [
      ["https://s.ru/?utm_source=vk", "https://vk.com/"],
      ["https://s.ru/galereya", "https://s.ru/?utm_source=vk"],
      ["https://s.ru/", "https://s.ru/galereya"],
    ]);
  });

  test("прямой заход — первый хит без referer", () => {
    const hits: (string | undefined)[] = [];
    const tracker = createPageviewTracker((_url, referer) => hits.push(referer));

    tracker.track("https://s.ru/", "");

    assert.deepEqual(hits, [undefined]);
  });

  test("buildPageUrl", () => {
    assert.equal(buildPageUrl("https://s.ru", "/02/", ""), "https://s.ru/02/");
    assert.equal(buildPageUrl("https://s.ru", "/", "utm_source=vk"), "https://s.ru/?utm_source=vk");
    assert.equal(buildPageUrl("https://s.ru", "/", "?email=a%40b.com&token=secret"), "https://s.ru/");
  });
});

describe("где работает счётчик", () => {
  test("публичные страницы — да, админка — нет", () => {
    assert.equal(isTrackedPath("/"), true);
    assert.equal(isTrackedPath("/02/"), true);
    assert.equal(isTrackedPath("/administrator-news"), true);
    assert.equal(isTrackedPath("/admin"), false);
    assert.equal(isTrackedPath("/admin/donations/1"), false);
  });
});

describe("параметры целей", () => {
  test("белый список: только сумма и служебные идентификаторы", () => {
    assert.deepEqual(
      sanitizeGoalParams({ amount: 100, method: "sbp", channel: "whatsapp", action: "copy", block: "hero", name: "Иван" }),
      { amount: 100, method: "sbp", channel: "whatsapp", action: "copy", block: "hero" },
    );
  });

  for (const [label, params] of [
    ["телефон в method", { method: "+79991234567" }],
    ["e-mail в channel", { channel: "a@b.ru" }],
    ["имя кириллицей в block", { block: "Иван Петров" }],
    ["отрицательная сумма", { amount: -1 }],
    ["сумма NaN", { amount: Number.NaN }],
    ["не объект", "строка"],
    ["null", null],
  ] as const) {
    test(`отбрасывается: ${label}`, () => {
      assert.equal(sanitizeGoalParams(params), undefined);
    });
  }
});

describe("согласие на cookie", () => {
  function jar(initial?: string, options: { throwsOnRead?: boolean; throwsOnWrite?: boolean } = {}) {
    const written: string[] = [];
    const cookieJar: CookieJar = {
      read: (name) => {
        if (options.throwsOnRead === true) {
          throw new Error("SecurityError");
        }

        return name === CONSENT_COOKIE ? initial : undefined;
      },
      write: (cookie) => {
        if (options.throwsOnWrite === true) {
          throw new Error("blocked");
        }

        written.push(cookie);
      },
      isSecure: true,
    };

    return { cookieJar, written };
  }

  test("parseConsent", () => {
    assert.equal(parseConsent("granted"), "granted");
    assert.equal(parseConsent("denied"), "denied");
    assert.equal(parseConsent("yes"), "unknown");
    assert.equal(parseConsent(undefined), "unknown");
  });

  test("cookie решения — на год, Lax, Secure на https", () => {
    assert.equal(
      serializeConsentCookie("denied", true),
      `shamil_consent=denied; Path=/; Max-Age=${CONSENT_MAX_AGE_S}; SameSite=Lax; Secure`,
    );
    assert.ok(!serializeConsentCookie("granted", false).includes("Secure"));
  });

  test("Метрика разрешена: без требования согласия — всегда, с требованием — только granted", () => {
    assert.equal(isAnalyticsAllowed("unknown", false), true);
    assert.equal(isAnalyticsAllowed("unknown", true), false);
    assert.equal(isAnalyticsAllowed("denied", true), false);
    assert.equal(isAnalyticsAllowed("granted", true), true);
  });

  test("решение запоминается в cookie и сразу видно подписчикам", () => {
    // Arrange
    const { cookieJar, written } = jar();
    const store = createConsentStore(cookieJar);
    let notified = 0;
    const unsubscribe = store.subscribe(() => {
      notified += 1;
    });

    // Act
    const before = store.getSnapshot();
    store.decide("denied");
    unsubscribe();
    store.decide("granted");

    // Assert
    assert.equal(before, "unknown");
    assert.equal(store.getSnapshot(), "granted");
    assert.equal(notified, 1);
    assert.equal(written.length, 2);
  });

  test("отказ из прошлого визита читается из cookie", () => {
    assert.equal(createConsentStore(jar("denied").cookieJar).getSnapshot(), "denied");
  });

  test("cookie недоступны — страница не падает, решение действует в визите", () => {
    // Arrange
    const store = createConsentStore(jar(undefined, { throwsOnRead: true, throwsOnWrite: true }).cookieJar);

    // Act + Assert
    assert.equal(store.getSnapshot(), "unknown");
    assert.doesNotThrow(() => store.decide("granted"));
    assert.equal(store.getSnapshot(), "granted");
  });
});

describe("один раз за визит", () => {
  function memoryStorage(): VisitStorage & { data: Map<string, string> } {
    const data = new Map<string, string>();

    return { data, getItem: (key) => data.get(key) ?? null, setItem: (key, value) => void data.set(key, value) };
  }

  test("первый вызов — да, повтор — нет, даже после перемонтирования (новый claim, то же хранилище)", () => {
    // Arrange
    const storage = memoryStorage();

    // Act
    const first = createOncePerVisit(() => storage);
    const remounted = createOncePerVisit(() => storage);

    // Assert
    assert.equal(first("donate_form_view"), true);
    assert.equal(first("donate_form_view"), false);
    assert.equal(remounted("donate_form_view"), false);
    assert.equal(first("other"), true);
  });

  test("sessionStorage бросает (приватный режим) — помним в памяти", () => {
    // Arrange
    const claim = createOncePerVisit(() => {
      throw new Error("SecurityError");
    });

    // Act + Assert
    assert.equal(claim("x"), true);
    assert.equal(claim("x"), false);
  });

  test("хранилища нет (SSR) — работает на памяти", () => {
    const claim = createOncePerVisit(() => undefined);

    assert.equal(claim("x"), true);
    assert.equal(claim("x"), false);
  });
});
