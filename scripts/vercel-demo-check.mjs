/**
 * Проверка демо-стенда на Vercel (docs/deploy-vercel-demo.md, «Проверка»).
 *
 * На 390 px и 1440 px: главная → форма → эмулятор «Оплатить: СБП» → «/spasibo»
 * → главная после ISR. На 1440 px дополнительно сценарии эмулятора (колбэк
 * дважды, битая подпись, отказ, колбэк через 10 с) и перевод по реквизитам
 * с подтверждением из админки. Скриншоты — в Claude outputs/vercel-demo-check/.
 *
 * Запуск из корня репозитория:
 *   SITE_URL=https://shamil-web.vercel.app API_URL=https://shamil-api.vercel.app/api \
 *   ADMIN_API_TOKEN=… node scripts/vercel-demo-check.mjs
 * PREFIX=cold- — префикс имён скриншотов (повторный прогон после холодного старта).
 * ONLY_MAIN=1 — только основной сценарий, без дополнительных.
 */

import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

import { chromium } from "playwright";

const SITE_URL = process.env.SITE_URL ?? "http://localhost:3000";
const API_URL = process.env.API_URL ?? "http://localhost:3001/api";
const ADMIN_TOKEN = process.env.ADMIN_API_TOKEN ?? "";
const PREFIX = process.env.PREFIX ?? "";
const ONLY_MAIN = process.env.ONLY_MAIN === "1";
const OUT_DIR = resolve("Claude outputs", "vercel-demo-check");

const DONATION_KOPECKS = 10_000n;
/** Главная кешируется на 15 с (ISR); ждём дольше, с запасом на перегенерацию. */
const HOME_WAIT_MS = 20_000;
const HOME_RETRY_MS = 45_000;
/** Окно поллинга «спасибо» — 30 с, плюс запас на сеть. */
const THANKS_WAIT_MS = 40_000;

const VIEWPORTS = [
  { name: "390", width: 390, height: 844 },
  { name: "1440", width: 1440, height: 900 },
];

const results = [];

function record(ok, name, detail = "") {
  results.push({ ok, name, detail });
  process.stdout.write(`${ok ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}\n`);
}

async function api(path, init) {
  const response = await fetch(`${API_URL}${path}`, init);

  if (!response.ok) {
    throw new Error(`${init?.method ?? "GET"} ${path} → ${response.status}`);
  }

  return response.json();
}

async function campaign() {
  const body = await api("/campaign");

  return { collected: BigInt(body.collectedKopecks), count: body.donationsCount };
}

async function donationStatus(orderId) {
  return (await api(`/donations/${orderId}/status`)).status;
}

function orderIdFrom(url) {
  const params = new URL(url).searchParams;

  return params.get("Shp_order_id") ?? params.get("order_id");
}

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

/** Главная → 100 ₽ → согласие → «Пожертвовать». Возвращается после ухода со страницы. */
async function submitForm(page, shot) {
  await page.goto(SITE_URL, { waitUntil: "networkidle" });
  await shot?.("01-home");

  const preset = page.locator("label", { hasText: /^100 ₽$/ }).first();
  await preset.scrollIntoViewIfNeeded();
  await preset.click();
  await page.locator("#donation-consent").check({ force: true });
  await shot?.("02-form");

  await page.getByRole("button", { name: /Пожертвовать/ }).first().click();
}

async function openEmulator(page, shot) {
  await submitForm(page, shot);
  await page.waitForURL(/\/dev\/robokassa\/checkout/, { timeout: 20_000 });
  await shot?.("03-emulator");

  return orderIdFrom(page.url());
}

async function waitThanksPaid(page) {
  await page.waitForURL(/\/spasibo/, { timeout: 20_000 });
  await page.getByText("Ваш вклад дошёл").waitFor({ timeout: THANKS_WAIT_MS });
}

async function checkNoHorizontalScroll(page, label) {
  const { scrollWidth, innerWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));

  record(scrollWidth <= innerWidth, `${label}: нет горизонтального скролла`, `${scrollWidth} ≤ ${innerWidth}`);
}

/** Основной сценарий: оплата СБП и рост цифр на главной. */
async function mainFlow(page, viewport, shot) {
  const before = await campaign();

  await page.goto(SITE_URL, { waitUntil: "networkidle" });

  if (viewport.width < 768) {
    await checkNoHorizontalScroll(page, `${viewport.name}px главная`);
  }

  const orderId = await openEmulator(page, shot);

  await page.getByRole("link", { name: "Оплатить: СБП" }).click();
  await waitThanksPaid(page);
  await shot("04-thanks-paid");

  const after = await campaign();
  const grew = after.collected - before.collected === DONATION_KOPECKS && after.count === before.count + 1;

  record(grew, `${viewport.name}px: «Собрано» +100 ₽ и платежей +1`, `${before.count} → ${after.count}`);

  const feed = await api("/donations/feed");

  record(feed.items.some((item) => item.id === orderId), `${viewport.name}px: платёж в ленте`);

  // Главная: ISR отдаёт устаревшую копию и перегенерирует её в фоне —
  // перезагружаем, пока в «Собрано» не появится новая сумма.
  await sleep(HOME_WAIT_MS);

  const rubles = (after.collected / 100n).toLocaleString("ru-RU").replace(/\s/g, "");
  const deadline = Date.now() + HOME_RETRY_MS;
  let shown = false;

  while (!shown && Date.now() < deadline) {
    await page.goto(SITE_URL, { waitUntil: "networkidle" });
    shown = (await page.locator("body").innerText()).replace(/\s/g, "").includes(`${rubles}₽`);

    if (!shown) {
      await sleep(5_000);
    }
  }

  await shot("05-home-after");
  record(shown, `${viewport.name}px: главная показывает ${rubles} ₽`);
}

async function scenario(page, name, run) {
  try {
    await run();
  } catch (error) {
    await page.screenshot({ path: resolve(OUT_DIR, `${PREFIX}1440-99-${name}.png`), fullPage: true }).catch(() => {});
    record(false, name, error instanceof Error ? error.message : String(error));
  }
}

async function extraScenarios(page) {
  const shot = (name) => page.screenshot({ path: resolve(OUT_DIR, `${PREFIX}1440-${name}.png`), fullPage: true });

  await scenario(page, "Колбэк дважды", async () => {
    const before = await campaign();

    await openEmulator(page);
    await page.getByRole("link", { name: "Колбэк дважды" }).click();
    await waitThanksPaid(page);

    const growth = (await campaign()).collected - before.collected;

    record(growth === DONATION_KOPECKS, "Колбэк дважды: сумма выросла один раз", `+${growth / 100n} ₽`);
  });

  await scenario(page, "Битая подпись", async () => {
    const orderId = await openEmulator(page);

    await page.getByRole("link", { name: "Колбэк с битой подписью" }).click();
    await page.waitForURL(/\/spasibo/, { timeout: 20_000 });
    await sleep(5_000);
    await shot("06-bad-signature");

    const status = await donationStatus(orderId);

    record(status === "pending", "Битая подпись: донат остаётся pending", status);
  });

  await scenario(page, "Отказ", async () => {
    const orderId = await openEmulator(page);

    await page.getByRole("link", { name: "Отказаться от оплаты" }).click();
    await page.waitForURL((url) => url.href.replace(/\/$/, "") === SITE_URL, { timeout: 20_000 });

    const status = await donationStatus(orderId);

    record(status === "pending", "Отказ: возврат на главную, донат pending", status);
  });

  await scenario(page, "Колбэк через 10 с", async () => {
    const orderId = await openEmulator(page);

    await page.getByRole("link", { name: "Колбэк через 10 с" }).click();
    await page.waitForURL(/\/spasibo/, { timeout: 20_000 });
    await shot("07-delay10-checking");
    await page.getByText("Ваш вклад дошёл").waitFor({ timeout: THANKS_WAIT_MS });
    await shot("08-delay10-paid");

    record((await donationStatus(orderId)) === "paid", "Колбэк через 10 с: «спасибо» ловит оплату");
  });

  await scenario(page, "Перевод по реквизитам", async () => {
    if (ADMIN_TOKEN.length === 0) {
      throw new Error("ADMIN_API_TOKEN не задан");
    }

    // Таба «Расчётный счёт» в форме макета v2 нет (ChannelTabs не подключён):
    // заказ создаётся тем же POST /donations, что шлёт форма, с channel=transfer.
    const created = await api("/donations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amountKopecks: Number(DONATION_KOPECKS), personalDataConsent: true, channel: "transfer" }),
    });
    const redirect = new URL(created.redirectUrl, SITE_URL);

    await page.goto(redirect.href, { waitUntil: "networkidle" });
    await page.waitForURL(/\/donate\/transfer/, { timeout: 20_000 });
    await shot("09-transfer-requisites");

    const orderId = orderIdFrom(page.url());

    await api(`/admin/donations/${orderId}/confirm`, {
      method: "POST",
      headers: { Authorization: `Bearer ${ADMIN_TOKEN}`, "Content-Type": "application/json" },
      body: "{}",
    });
    await page.goto(`${SITE_URL}/spasibo?order_id=${orderId}`, { waitUntil: "networkidle" });
    await page.getByText("Ваш вклад дошёл").waitFor({ timeout: THANKS_WAIT_MS });
    await shot("10-transfer-confirmed");

    record(true, "Перевод по реквизитам: после подтверждения «оплачено»");
  });
}

async function run() {
  await mkdir(OUT_DIR, { recursive: true });

  const browser = await chromium.launch();

  try {
    for (const viewport of VIEWPORTS) {
      const context = await browser.newContext({ viewport, locale: "ru-RU" });
      const page = await context.newPage();
      const shot = (name) =>
        page.screenshot({ path: resolve(OUT_DIR, `${PREFIX}${viewport.name}-${name}.png`), fullPage: true });

      try {
        await mainFlow(page, viewport, shot);

        if (!ONLY_MAIN && viewport.width >= 1024) {
          await extraScenarios(page);
        }
      } catch (error) {
        await shot("99-failure").catch(() => {});
        record(false, `${viewport.name}px основной сценарий`, error instanceof Error ? error.message : String(error));
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }

  const failed = results.filter((result) => !result.ok).length;

  process.stdout.write(`\nИтого: ${results.length - failed} ✓, ${failed} ✗. Скриншоты: ${OUT_DIR}\n`);
  process.exitCode = failed > 0 ? 1 : 0;
}

await run();
