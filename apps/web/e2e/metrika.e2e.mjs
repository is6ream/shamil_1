/**
 * E2E: Яндекс Метрика и сквозной учёт UTM на собранном сайте (Playwright).
 *
 * Сеть закрыта: `mc.yandex.ru` отдаёт заглушку `tag.js`, которая записывает
 * вызовы `ym`, а API (`POST /donations` и всё остальное) перехватывается
 * в браузере — ни одного запроса ни в Метрику, ни в настоящий бэкенд.
 *
 * Нужен собранный сайт с включённой Метрикой:
 *   NEXT_PUBLIC_YM_ENABLED=true NEXT_PUBLIC_YM_COUNTER_ID=12345678 npx next build
 *   npx next start -p 3355
 * Запуск (из apps/web):  SITE_URL=http://localhost:3355 node --test e2e/metrika.e2e.mjs
 */
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";

import { chromium } from "playwright";

const SITE = (process.env.SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const CLIENT_ID = "1729000000123456789";
const UTM_QUERY = "?utm_source=vk&utm_medium=social&utm_campaign=ramadan_2026";

/** Заглушка tag.js: выполняет очередь и записывает вызовы, на getClientID отвечает ClientID. */
const TAG_STUB = `(function () {
  var queue = (window.ym && window.ym.a) || [];
  window.__ymCalls = [];
  function ym() {
    var args = Array.prototype.slice.call(arguments);
    window.__ymCalls.push(args);
    if (args[1] === "getClientID" && typeof args[2] === "function") { args[2]("${CLIENT_ID}"); }
  }
  window.ym = ym;
  queue.forEach(function (args) { ym.apply(null, args); });
})();`;

let browser;

before(async () => {
  browser = await chromium.launch();
});

after(async () => {
  await browser?.close();
});

/** Контекст с закрытой сетью: Метрика — заглушка, API — перехват. */
async function openContext(viewport = { width: 1440, height: 900 }) {
  const context = await browser.newContext({ viewport });
  const tagRequests = [];
  const donationBodies = [];
  const foreignRequests = [];

  await context.route("https://mc.yandex.ru/**", (route) => {
    tagRequests.push(route.request().url());

    return route.request().url().includes("/metrika/tag.js")
      ? route.fulfill({ status: 200, contentType: "application/javascript", body: TAG_STUB })
      : route.fulfill({ status: 204, body: "" });
  });

  await context.route(/\/api\//, (route) => {
    const request = route.request();

    if (request.method() === "POST" && new URL(request.url()).pathname.endsWith("/donations")) {
      donationBodies.push(request.postDataJSON());

      return route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({ orderId: "00000000-0000-4000-8000-000000000001", redirectUrl: `${SITE}/#qa-submitted` }),
      });
    }

    return route.fulfill({ status: 503, contentType: "application/json", body: "{}" });
  });

  // Всё, что не сайт и не перехвачено выше, — запрещено.
  await context.route(
    (url) => url.origin !== SITE && url.hostname !== "mc.yandex.ru" && !url.pathname.includes("/api/"),
    (route) => {
      foreignRequests.push(route.request().url());

      return route.abort();
    },
  );

  const page = await context.newPage();

  return { context, page, tagRequests, donationBodies, foreignRequests };
}

async function ymCalls(page) {
  return page.evaluate(() => window.__ymCalls ?? []);
}

async function decide(page, name) {
  const button = page.getByRole('button', { name, exact: true });
  // The mobile banner intentionally hides while the donation form is visible.
  if ((page.viewportSize()?.width ?? 1440) < 768) {
    await page.locator('footer').scrollIntoViewIfNeeded();
  }
  await button.click();
}

async function goals(page) {
  return (await ymCalls(page)).filter((call) => call[1] === "reachGoal").map((call) => call[2]);
}

async function cookie(context, name) {
  return (await context.cookies(SITE)).find((item) => item.name === name)?.value;
}

/** Открыть вкладку «Через форму», выбрать 500 ₽ и отправить анонимно. */
async function spaPush(page, path) {
  await page.evaluate(async (path) => {
    const fiberKey = Object.keys(document.body).find((key) => key.startsWith('__reactFiber$'));
    let fiber = document.body[fiberKey];
    while (fiber) {
      const value = fiber.memoizedProps?.value;
      if (value && typeof value.push === 'function' && typeof value.refresh === 'function') { value.push(path); return; }
      fiber = fiber.return;
    }
    throw new Error('Next AppRouter context not found');
  }, path);
  await page.waitForURL(`${SITE}${path}`);
}

async function donate500(page) {
  await page.locator("#donate").scrollIntoViewIfNeeded();
  await page.locator("#donation-consent").check({ force: true });
  await page.getByRole("radio", { name: /^500\s₽$/ }).check({ force: true });
  await page.locator("#donate form button[type=submit]").click();
}

describe("Метрика и UTM", () => {
  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    for (const decision of ['Принять', 'Отказаться']) {
      test(`consent ${decision}: identifiers and UTM ${viewport.width}`, async () => {
        const { context, page, donationBodies, foreignRequests } = await openContext(viewport);
        await page.goto(`${SITE}/${UTM_QUERY}&yclid=5207465128348827647`);
        await decide(page, decision);
        if (decision === 'Принять') await page.waitForFunction(() => Array.isArray(window.__ymCalls));
        await page.locator('#donate').scrollIntoViewIfNeeded();
        await page.screenshot({ path: `../../../qa-${viewport.width}-${decision === 'Принять' ? 'granted' : 'denied'}.png` });
        await donate500(page);
        await page.waitForTimeout(300);
        assert.equal(donationBodies.length, 1);
        assert.equal(donationBodies[0].amountKopecks, 50000);
        assert.equal(donationBodies[0].attribution.first.source, 'vk');
        assert.equal(donationBodies[0].attribution.last.source, 'vk');
        assert.equal(donationBodies[0].attribution.yclid, '5207465128348827647');
        assert.equal(donationBodies[0].attribution.ymClientId, decision === 'Принять' ? CLIENT_ID : undefined);
        assert.deepEqual(foreignRequests, []);
        await context.close();
      });
    }
    test(`SPA admin destruct/re-init ${viewport.width}`, async () => {
      const { context, page } = await openContext(viewport);
      await page.goto(`${SITE}/`);
      await decide(page, 'Принять');
      await page.waitForFunction(() => window.__ymCalls?.some((c) => c[1] === 'hit'));
      await spaPush(page, '/admin/login');
      await page.waitForFunction(() => window.__ymCalls?.some((c) => c[1] === 'destruct'));
      let calls = await ymCalls(page);
      const stop = calls.findLastIndex((c) => c[1] === 'destruct');
      assert.ok(!calls.slice(stop + 1).some((c) => ['hit', 'reachGoal', 'init'].includes(c[1])));
      await spaPush(page, '/');
      await page.waitForFunction(() => window.__ymCalls?.filter((c) => c[1] === 'init').length === 2);
      calls = await ymCalls(page);
      assert.equal(calls.filter((c) => c[1] === 'hit').length, 2);
      await context.close();
    });
    test(`tag.js blocked: donation still submits with UTM ${viewport.width}`, async () => {
      const { context, page, donationBodies } = await openContext(viewport);
      await context.route('https://mc.yandex.ru/**', (route) => route.abort());
      await page.goto(`${SITE}/${UTM_QUERY}`);
      await decide(page, 'Принять');
      await donate500(page);
      await page.waitForTimeout(1800);
      assert.equal(donationBodies.length, 1);
      assert.equal(donationBodies[0].attribution.last.source, 'vk');
      assert.equal(donationBodies[0].attribution.ymClientId, undefined);
      await context.close();
    });
  }

  test("заход с UTM → согласие → цели и UTM с ClientID в теле доната", async () => {
    // Arrange
    const { context, page, tagRequests, donationBodies, foreignRequests } = await openContext();

    // Act: заход по ссылке кампании, согласие, переход по сайту и обратно
    await page.goto(`${SITE}/${UTM_QUERY}`);
    await page.getByRole("button", { name: "Принять" }).click();
    // Форма на первом экране видна ещё до «Принять» — показ уходит сразу после согласия.
    await page.waitForFunction(() =>
      Array.isArray(window.__ymCalls) && window.__ymCalls.some((call) => call[2] === "donate_form_view"),
    );
    await page.goto(`${SITE}/galereya`);
    await page.goto(`${SITE}/`);
    await page.waitForFunction(() => Array.isArray(window.__ymCalls));
    await donate500(page);
    await page.waitForFunction(() => window.__ymCalls.some((call) => call[2] === "donate_submit"));
    await page.waitForTimeout(500);

    // Assert: счётчик загружен, первый хит — с метками, init в SPA-режиме
    assert.ok(tagRequests.some((url) => url.includes("/metrika/tag.js?id=12345678")));

    const calls = await ymCalls(page);
    const init = calls.find((call) => call[1] === "init");

    assert.equal(init?.[2]?.defer, true);
    assert.equal(calls.filter((call) => call[1] === "hit").length, 1, "один хит на загрузку страницы");

    // Assert: цели формы
    const reached = await goals(page);

    for (const goal of ["donate_amount_select", "donate_submit"]) {
      assert.ok(reached.includes(goal), `нет цели ${goal}: ${reached.join(", ")}`);
    }

    // donate_form_view ушла на первой загрузке главной; повторный показ в том же визите — не цель.
    assert.ok(!reached.includes("donate_form_view"), "donate_form_view — один раз за визит");

    assert.ok(!reached.includes("donation_paid"), "оплату считает только сервер");

    // Assert: тело доната — UTM последнего захода и ClientID
    assert.equal(donationBodies.length, 1);
    assert.deepEqual(donationBodies[0].attribution.last, {
      source: "vk",
      medium: "social",
      campaign: "ramadan_2026",
    });
    assert.equal(donationBodies[0].attribution.ymClientId, CLIENT_ID);
    assert.equal(donationBodies[0].amountKopecks, 50_000);
    assert.deepEqual(foreignRequests, []);

    await context.close();
  });

  test("повторный заход без UTM не затирает last-touch, с новыми UTM — затирает", async () => {
    // Arrange
    const { context, page } = await openContext();

    // Act + Assert
    await page.goto(`${SITE}/${UTM_QUERY}`);
    const firstTouch = await cookie(context, "shamil_ft");
    const lastTouch = await cookie(context, "shamil_lt");

    await page.goto(`${SITE}/`);
    assert.equal(await cookie(context, "shamil_lt"), lastTouch);

    await page.goto(`${SITE}/?utm_source=telegram&utm_medium=messenger&yclid=5207465128348827647`);
    assert.match(decodeURIComponent((await cookie(context, "shamil_lt")) ?? ""), /"source":"telegram"/);
    assert.equal(await cookie(context, "shamil_ft"), firstTouch, "first-touch не перезаписывается");
    assert.equal(await cookie(context, "shamil_yclid"), "5207465128348827647");

    await context.close();
  });

  test("до согласия: ни tag.js, ни cookie _ym_*; цель, сработавшая до «Принять», не теряется", async () => {
    // Arrange
    const { context, page, tagRequests } = await openContext();

    // Act: выбор суммы до ответа на баннер
    await page.goto(`${SITE}/`);
    await page.locator("#donate").scrollIntoViewIfNeeded();
    await page.locator("#donation-consent").check({ force: true });
    await page.getByRole("radio", { name: /^500\s₽$/ }).check({ force: true });
    await page.waitForTimeout(500);

    // Assert: до согласия Метрики на странице нет вовсе
    assert.deepEqual(tagRequests, []);
    assert.equal(await page.evaluate(() => typeof window.ym), "undefined");
    assert.deepEqual((await context.cookies(SITE)).filter((item) => item.name.startsWith("_ym")), []);

    // Act: согласие
    await page.getByRole("button", { name: "Принять" }).click();
    await page.waitForFunction(() => Array.isArray(window.__ymCalls) && window.__ymCalls.some((call) => call[1] === "reachGoal"));

    // Assert: накопленная цель ушла после хита
    const calls = await ymCalls(page);
    const firstHit = calls.findIndex((call) => call[1] === "hit");
    const amountGoal = calls.findIndex((call) => call[1] === "reachGoal" && call[2] === "donate_amount_select");

    assert.ok(amountGoal > firstHit && firstHit >= 0, "цель до согласия отправлена после первого хита");
    assert.deepEqual(calls[amountGoal][3], { amount: 500 });

    // Форма была видна до «Принять»: показ не теряется и не задваивается
    const formViews = calls
      .map((call, index) => ({ call, index }))
      .filter(({ call }) => call[1] === "reachGoal" && call[2] === "donate_form_view");

    assert.equal(formViews.length, 1, "donate_form_view — ровно один раз");
    assert.ok(formViews[0].index > firstHit, "donate_form_view — после первого хита");

    await context.close();
  });

  test("отказ от cookie: tag.js не грузится, UTM всё равно уходят на бэкенд", async () => {
    // Arrange
    const { context, page, tagRequests, donationBodies } = await openContext();

    // Act
    await page.goto(`${SITE}/${UTM_QUERY}`);
    await page.getByRole("button", { name: "Отказаться" }).click();
    await page.goto(`${SITE}/`);
    await donate500(page);
    await page.waitForTimeout(1_000);

    // Assert
    assert.deepEqual(tagRequests, []);
    assert.equal(await page.evaluate(() => typeof window.ym), "undefined", "цели до отказа не отправлены — счётчика нет");
    assert.deepEqual((await context.cookies(SITE)).filter((item) => item.name.startsWith("_ym")), []);
    assert.equal(await cookie(context, "shamil_consent"), "denied");
    assert.equal(await page.getByRole("button", { name: "Принять" }).count(), 0, "отказ запомнен");
    assert.equal(donationBodies.length, 1);
    assert.equal(donationBodies[0].attribution.last.source, "vk");
    assert.equal(donationBodies[0].attribution.ymClientId, undefined);

    await context.close();
  });

  for (const viewport of [
    { width: 360, height: 640 },
    { width: 1440, height: 900 },
  ]) {
    test(`форма доступна без горизонтальной прокрутки и перекрытия баннером: ${viewport.width}×${viewport.height}`, async () => {
      // Arrange
      const { context, page } = await openContext(viewport);

      // Act
      await page.goto(`${SITE}/`);
      await page.locator("#donate").scrollIntoViewIfNeeded();
      await page.locator("#donation-consent").check({ force: true });
      await page.locator("#donate").evaluate((node) => node.scrollIntoView({ block: "start" }));
      await page.waitForTimeout(400);

      // Assert: карточка формы не выше экрана
      const card = await page.locator("#donate > *").first().boundingBox();

      assert.ok(card !== null);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), "no horizontal overflow");

      // Assert: баннер (если виден) не пересекается с формой
      const banner = page.getByRole("region", { name: "Согласие на cookie" });
      const box = (await banner.isVisible()) ? await banner.boundingBox() : null;

      if (box !== null) {
        const overlaps =
          box.x < card.x + card.width && card.x < box.x + box.width && box.y < card.y + card.height && card.y < box.y + box.height;

        assert.ok(!overlaps, "баннер перекрывает форму");
      }

      await context.close();
    });
  }
});
