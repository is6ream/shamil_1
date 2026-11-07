import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { resolveMetrikaConfig } from "./config";
import { METRIKA_GOALS } from "./goals";
import { PENDING_GOALS_LIMIT, createMetrika, installMetrikaQueue, stopMetrika, normalizeClientId } from "./metrika";
import type { MetrikaEnvironment, YmFunction } from "./metrika";

describe("counter lifecycle", () => {
  test("late tag.js cannot replay public events after entering admin; returning re-inits", () => {
    const target = {} as Window;
    installMetrikaQueue(target, COUNTER, { webvisor: true });
    target.ym?.(COUNTER, "hit", "/");
    target.ym?.(COUNTER, "reachGoal", "donate_submit");
    stopMetrika(target, COUNTER);
    assert.deepEqual(target.ym?.a, [[COUNTER, "destruct"]]);
    installMetrikaQueue(target, COUNTER, { webvisor: true });
    assert.equal(target.ym?.a?.filter((call) => call[1] === "init").length, 1);
    installMetrikaQueue(target, COUNTER, { webvisor: true });
    assert.equal(target.ym?.a?.filter((call) => call[1] === "init").length, 1);
  });

  test("active counter is destroyed and cached ClientID is unavailable after disabling", async () => {
    const calls: unknown[][] = [];
    const ym: YmFunction = (...args) => {
      calls.push(args);
      if (args[1] === "getClientID") (args[2] as (id: string) => void)("123");
    };
    const target = { ym } as Window;
    const environment = { ...env(ym), getYm: () => target.ym };
    const wrapper = createMetrika(COUNTER, environment);
    assert.equal(await wrapper.getClientId(), "123");
    stopMetrika(target, COUNTER);
    target.ym = undefined;
    assert.equal(await wrapper.getClientId(), null);
    assert.equal(calls.at(-1)?.[1], "destruct");
  });
});

const COUNTER = 98765432;

interface Call {
  readonly counterId: number;
  readonly method: string;
  readonly args: readonly unknown[];
}

/** Фейковый `ym`: записывает вызовы, на `getClientID` отвечает по сценарию. */
function fakeYm(clientId: unknown = "1729000000123456789", options: { silent?: boolean; throws?: boolean } = {}) {
  const calls: Call[] = [];
  const ym: YmFunction = (counterId, method, ...args) => {
    calls.push({ counterId, method, args });

    if (options.throws === true) {
      throw new Error("ym broken");
    }

    if (method === "getClientID" && options.silent !== true) {
      (args[0] as (id: unknown) => void)(clientId);
    }
  };

  return { ym, calls };
}

function env(ym: YmFunction | undefined, cookies: Record<string, string> = {}): MetrikaEnvironment & { warnings: string[] } {
  const warnings: string[] = [];

  return {
    warnings,
    getYm: () => ym,
    readCookie: (name) => cookies[name],
    warn: (message) => {
      warnings.push(message);
    },
  };
}

/** Окружение, где счётчик появляется позже — как после «Принять». */
function lateYm() {
  const { ym, calls } = fakeYm();
  let current: YmFunction | undefined;
  const environment: MetrikaEnvironment = {
    getYm: () => current,
    readCookie: () => undefined,
    warn: () => undefined,
  };

  return { calls, environment, install: () => (current = ym) };
}

describe("resolveMetrikaConfig", () => {
  test("включается только явным флагом и корректным номером", () => {
    assert.equal(resolveMetrikaConfig({ counterId: "123", enabled: "true", requireConsent: undefined, webvisor: undefined }).counterId, 123);
    assert.equal(resolveMetrikaConfig({ counterId: "123", enabled: undefined, requireConsent: undefined, webvisor: undefined }).counterId, null);
    assert.equal(resolveMetrikaConfig({ counterId: "", enabled: "true", requireConsent: undefined, webvisor: undefined }).counterId, null);
    assert.equal(resolveMetrikaConfig({ counterId: "12a", enabled: "true", requireConsent: undefined, webvisor: undefined }).counterId, null);
  });

  test("согласие и Вебвизор включены по умолчанию, выключаются только false", () => {
    const defaults = resolveMetrikaConfig({ counterId: "1", enabled: "true", requireConsent: undefined, webvisor: undefined });
    const off = resolveMetrikaConfig({ counterId: "1", enabled: "true", requireConsent: "false", webvisor: "false" });

    assert.deepEqual([defaults.requireConsent, defaults.webvisor], [true, true]);
    assert.deepEqual([off.requireConsent, off.webvisor], [false, false]);
  });
});

describe("createMetrika: no-op", () => {
  test("без номера счётчика ничего не вызывается и ClientID нет", async () => {
    // Arrange
    const { ym, calls } = fakeYm();
    const metrika = createMetrika(null, env(ym));

    // Act
    metrika.hit("https://mechetshamil.ru/");
    metrika.reachGoal(METRIKA_GOALS.submit, { amount: 100 });
    metrika.params({ block: "hero" });

    // Assert
    assert.equal(metrika.isEnabled, false);
    assert.equal(metrika.isActive(), false);
    assert.equal(calls.length, 0);
    assert.equal(await metrika.getClientId(), null);
  });

  test("без согласия (ym не загружен) — no-op, старая cookie _ym_uid не отдаётся", async () => {
    // Arrange
    const metrika = createMetrika(COUNTER, env(undefined, { _ym_uid: "1111" }));

    // Act + Assert
    assert.equal(metrika.isActive(), false, "до согласия цели «раз за визит» не тратятся");
    assert.doesNotThrow(() => metrika.reachGoal(METRIKA_GOALS.formView));
    assert.equal(await metrika.getClientId(), null);
  });

  test("ym бросает — наружу не выходит, предупреждение пишется", async () => {
    // Arrange
    const environment = env(fakeYm("1", { throws: true }).ym);
    const metrika = createMetrika(COUNTER, environment);

    // Act + Assert
    assert.doesNotThrow(() => metrika.hit("/"));
    assert.equal(await metrika.getClientId(10), null);
    assert.ok(environment.warnings.length >= 1);
  });
});

describe("createMetrika: вызовы", () => {
  test("hit с referer, reachGoal с безопасными параметрами", () => {
    // Arrange
    const { ym, calls } = fakeYm();
    const metrika = createMetrika(COUNTER, env(ym));

    // Act
    assert.equal(metrika.isActive(), true);
    metrika.hit("https://mechetshamil.ru/?utm_source=vk", { referer: "https://vk.com/" });
    metrika.reachGoal(METRIKA_GOALS.submit, { amount: 500, method: "sbp" });
    metrika.reachGoal(METRIKA_GOALS.formView);

    // Assert
    assert.deepEqual(calls, [
      { counterId: COUNTER, method: "hit", args: ["https://mechetshamil.ru/?utm_source=vk", { referer: "https://vk.com/" }] },
      { counterId: COUNTER, method: "reachGoal", args: ["donate_submit", { amount: 500, method: "sbp" }] },
      { counterId: COUNTER, method: "reachGoal", args: ["donate_form_view"] },
    ]);
  });

  test("ни одна цель не уносит ПДн, даже если их передали по ошибке", () => {
    // Arrange
    const { ym, calls } = fakeYm();
    const metrika = createMetrika(COUNTER, env(ym));
    const leaky = { amount: 100, name: "Иван", phone: "+79991234567", email: "a@b.ru", comment: "от семьи" };

    // Act
    for (const goal of Object.values(METRIKA_GOALS)) {
      metrika.reachGoal(goal, leaky as never);
    }

    metrika.params(leaky as never);

    // Assert
    const serialized = JSON.stringify(calls);

    for (const forbidden of ["name", "phone", "email", "comment", "Иван", "+7999", "a@b.ru"]) {
      assert.ok(!serialized.includes(forbidden), `в Метрику ушло «${forbidden}»`);
    }
  });

  test("donation_paid с клиента не отправить: его нет среди целей", () => {
    assert.ok(!(Object.values(METRIKA_GOALS) as string[]).includes("donation_paid"));
  });
});

describe("getClientId", () => {
  test("ответ счётчика, затем — из кэша без нового вызова", async () => {
    // Arrange
    const { ym, calls } = fakeYm(1729000000123456789n.toString());
    const metrika = createMetrika(COUNTER, env(ym));

    // Act
    const first = await metrika.getClientId();
    const second = await metrika.getClientId();

    // Assert
    assert.equal(first, "1729000000123456789");
    assert.equal(second, first);
    assert.equal(calls.filter((call) => call.method === "getClientID").length, 1);
  });

  test("таймаут (tag.js не загрузился) — запасной путь через cookie _ym_uid", async () => {
    // Arrange
    const metrika = createMetrika(COUNTER, env(fakeYm("1", { silent: true }).ym, { _ym_uid: "1650000000777" }));

    // Act
    const started = Date.now();
    const clientId = await metrika.getClientId(30);

    // Assert
    assert.equal(clientId, "1650000000777");
    assert.ok(Date.now() - started < 1_000);
  });

  test("таймаут и нет cookie — null, оплата идёт без ClientID", async () => {
    const metrika = createMetrika(COUNTER, env(fakeYm("1", { silent: true }).ym));

    assert.equal(await metrika.getClientId(20), null);
  });

  test("мусор вместо ClientID — null", async () => {
    const metrika = createMetrika(COUNTER, env(fakeYm("<script>").ym));

    assert.equal(await metrika.getClientId(20), null);
  });

  test("normalizeClientId", () => {
    assert.equal(normalizeClientId("123"), "123");
    assert.equal(normalizeClientId(123), "123");
    assert.equal(normalizeClientId(" 123 "), "123");
    assert.equal(normalizeClientId("12a"), null);
    assert.equal(normalizeClientId(1.5), null);
    assert.equal(normalizeClientId(undefined), null);
  });
});

describe("installMetrikaQueue", () => {
  test("очередь копит вызовы до загрузки tag.js, init — с defer: true", () => {
    // Arrange
    const target = {} as Window;

    // Act
    installMetrikaQueue(target, COUNTER, { webvisor: false });
    target.ym?.(COUNTER, "hit", "/");

    // Assert
    assert.equal(typeof target.ym?.l, "number");
    assert.deepEqual(target.ym?.a, [
      [
        COUNTER,
        "init",
        { defer: true, clickmap: true, trackLinks: true, accurateTrackBounce: true, webvisor: false },
      ],
      [COUNTER, "hit", "/"],
    ]);
  });

  test("загруженный tag.js не подменяется очередью", () => {
    // Arrange
    const { ym, calls } = fakeYm();
    const target = { ym } as unknown as Window;

    // Act
    installMetrikaQueue(target, COUNTER, { webvisor: true });

    // Assert
    assert.equal(target.ym, ym);
    assert.equal(calls[0]?.method, "init");
  });
});

describe("цели до ответа на баннер", () => {
  test("копятся без отправки и уходят по порядку после согласия", () => {
    // Arrange
    const { calls, environment, install } = lateYm();
    const metrika = createMetrika(COUNTER, environment);

    // Act
    metrika.reachGoal(METRIKA_GOALS.amountSelect, { amount: 500 });
    metrika.reachGoal(METRIKA_GOALS.methodSelect, { method: "sbp" });
    const sentBeforeConsent = calls.length;
    install();
    metrika.flushPending();
    metrika.flushPending();

    // Assert
    assert.equal(sentBeforeConsent, 0);
    assert.deepEqual(
      calls.map((call) => [call.method, ...call.args]),
      [
        ["reachGoal", "donate_amount_select", { amount: 500 }],
        ["reachGoal", "donate_method_select", { method: "sbp" }],
      ],
    );
  });

  test("отказ стирает накопленное, и новые цели больше не копятся", () => {
    // Arrange
    const { calls, environment, install } = lateYm();
    const metrika = createMetrika(COUNTER, environment);

    // Act
    metrika.reachGoal(METRIKA_GOALS.submit, { amount: 100 });
    metrika.discardPending();
    metrika.reachGoal(METRIKA_GOALS.shareClick, { channel: "vk" });
    install();
    metrika.flushPending();

    // Assert
    assert.equal(calls.length, 0);
  });

  test("буфер ограничен, ПДн в нём не задерживаются", () => {
    // Arrange
    const { calls, environment, install } = lateYm();
    const metrika = createMetrika(COUNTER, environment);

    // Act
    for (let i = 0; i < PENDING_GOALS_LIMIT + 5; i += 1) {
      metrika.reachGoal(METRIKA_GOALS.shareClick, { channel: "copy", phone: "+79990000000" } as never);
    }
    install();
    metrika.flushPending();

    // Assert
    assert.equal(calls.length, PENDING_GOALS_LIMIT);
    assert.deepEqual(calls[0]?.args, ["share_click", { channel: "copy" }]);
  });

  test("без счётчика буфер не нужен: flushPending — no-op", () => {
    const { calls, environment } = lateYm();
    const metrika = createMetrika(COUNTER, environment);

    metrika.reachGoal(METRIKA_GOALS.submit);
    metrika.flushPending();

    assert.equal(calls.length, 0);
  });
});

describe("цели «раз за визит» (donate_form_view)", () => {
  /** Флаг визита в памяти: `claim` — `true` только в первый раз. */
  function visitFlags() {
    const claimed: string[] = [];
    const claim = (key: string): boolean => {
      if (claimed.includes(key)) {
        return false;
      }

      claimed.push(key);

      return true;
    };

    return { claimed, claim };
  }

  test("счётчик активен — флаг расходуется, цель уходит один раз", () => {
    // Arrange
    const { ym, calls } = fakeYm();
    const metrika = createMetrika(COUNTER, env(ym));
    const { claimed, claim } = visitFlags();

    // Act
    metrika.reachGoalOncePerVisit(METRIKA_GOALS.formView, claim);
    metrika.reachGoalOncePerVisit(METRIKA_GOALS.formView, claim);

    // Assert
    assert.deepEqual(claimed, ["donate_form_view"]);
    assert.deepEqual(calls.map((call) => call.args), [["donate_form_view"]]);
  });

  test("форма видна до «Принять»: флаг не тратится, цель уходит после согласия", () => {
    // Arrange
    const { calls, environment, install } = lateYm();
    const metrika = createMetrika(COUNTER, environment);
    const { claimed, claim } = visitFlags();

    // Act: показ до согласия, повторный показ тоже до согласия
    metrika.reachGoalOncePerVisit(METRIKA_GOALS.formView, claim);
    metrika.reachGoalOncePerVisit(METRIKA_GOALS.formView, claim);
    const claimedBeforeConsent = [...claimed];
    install();
    metrika.flushPending();
    metrika.reachGoalOncePerVisit(METRIKA_GOALS.formView, claim);

    // Assert
    assert.deepEqual(claimedBeforeConsent, []);
    assert.deepEqual(calls.map((call) => call.args), [["donate_form_view"]]);
  });

  test("флаг уже потрачен в этом визите (другая страница) — из буфера не уходит", () => {
    // Arrange
    const { calls, environment, install } = lateYm();
    const metrika = createMetrika(COUNTER, environment);
    const { claim } = visitFlags();

    // Act
    claim(METRIKA_GOALS.formView);
    metrika.reachGoalOncePerVisit(METRIKA_GOALS.formView, claim);
    install();
    metrika.flushPending();

    // Assert
    assert.equal(calls.length, 0);
  });

  test("отказ: флаг не тратится, цель не уходит", () => {
    // Arrange
    const { calls, environment, install } = lateYm();
    const metrika = createMetrika(COUNTER, environment);
    const { claimed, claim } = visitFlags();

    // Act
    metrika.reachGoalOncePerVisit(METRIKA_GOALS.formView, claim);
    metrika.discardPending();
    install();
    metrika.flushPending();

    // Assert
    assert.deepEqual(claimed, []);
    assert.equal(calls.length, 0);
  });

  test("без счётчика — no-op, флаг не тратится", () => {
    // Arrange
    const metrika = createMetrika(null, env(fakeYm().ym));
    const { claimed, claim } = visitFlags();

    // Act
    metrika.reachGoalOncePerVisit(METRIKA_GOALS.formView, claim);
    metrika.flushPending();

    // Assert
    assert.deepEqual(claimed, []);
  });
});
