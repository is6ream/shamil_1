/**
 * Смоук сквозной тестовой оплаты в настоящем браузере.
 *
 * Региональная ссылка `/?region=02` → 100 ₽ → согласие → «Пожертвовать» → эмулятор
 * Robokassa → «Оплатить: СБП» → «/spasibo» с текстом успеха → главная
 * после revalidate показывает Башкортостан в «Географии поддержки».
 * Прогоняется на 390 px и 1440 px, скриншоты — в Claude outputs/backend-v3-check/.
 *
 * Нужны запущенные бэкенд с эмулятором и фронтенд — см. README,
 * «Локальный запуск с тестовой оплатой». Запуск из корня репозитория:
 *   node scripts/smoke-test-payment.mjs
 * Адреса переопределяются: SITE_URL=http://localhost:3100 API_URL=http://localhost:3001/api
 * Браузер: npx playwright install chromium — или, если CDN Playwright недоступен,
 * установленный Chrome/Edge: PLAYWRIGHT_CHANNEL=chrome (msedge).
 */

import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

import { chromium } from "playwright";

const SITE_URL = process.env.SITE_URL ?? "http://localhost:3000";
const API_URL = process.env.API_URL ?? "http://localhost:3001/api";
const OUT_DIR = resolve("Claude outputs", "backend-v3-check");
/** `chrome` / `msedge` — системный браузер вместо скачанного Playwright. */
const BROWSER_CHANNEL = process.env.PLAYWRIGHT_CHANNEL;

const DONATION_KOPECKS = 10_000n;
const REGION_SLUG = "02";
const REGION_NAME = "Башкортостан";

/** Главная кешируется на 15 с (ISR): ждём дольше, с запасом на перегенерацию. */
const REVALIDATE_WAIT_MS = 45_000;

const VIEWPORTS = [
  { name: "390", width: 390, height: 844 },
  { name: "1440", width: 1440, height: 900 },
];

async function collectedKopecks() {
  const response = await fetch(`${API_URL}/campaign`);

  if (!response.ok) {
    throw new Error(`GET /campaign → ${response.status}: бэкенд запущен?`);
  }

  const body = await response.json();

  return BigInt(body.collectedKopecks);
}

/**
 * Регион — через региональную ссылку: селектора «Откуда вы?» в форме макета v2
 * сейчас нет (компонент `RegionSelect` есть, но не подключён — см. отчёт).
 */
async function donate(page, shot) {
  await page.goto(`${SITE_URL}/?region=${REGION_SLUG}`, { waitUntil: "domcontentloaded" });
  await shot("01-home-before");

  const preset = page.locator("label", { hasText: /^100 ₽$/ }).first();
  await preset.scrollIntoViewIfNeeded();
  await preset.click();
  await page.locator("#donation-consent").check({ force: true });
  await shot("02-form-filled");

  await page.getByRole("button", { name: /Пожертвовать/ }).first().click();
  await page.waitForURL(/\/dev\/robokassa\/checkout/, { timeout: 15_000 });
  await shot("03-emulator-checkout");

  await page.getByRole("link", { name: "Оплатить: СБП" }).click();
  await page.waitForURL(/\/spasibo/, { timeout: 15_000 });
  await page.getByText("Ваш вклад дошёл").waitFor({ timeout: 35_000 });
  await shot("04-thanks-paid");
}

async function waitForRegionOnHome(page, shot) {
  const deadline = Date.now() + REVALIDATE_WAIT_MS;

  // ISR отдаёт устаревшую страницу и перегенерирует её в фоне, поэтому
  // главная перезагружается, пока Башкортостан не появится в рейтинге.
  while (Date.now() < deadline) {
    await page.goto(SITE_URL, { waitUntil: "domcontentloaded" });

    if ((await page.getByText(REGION_NAME, { exact: false }).count()) > 1) {
      await shot("05-home-after");

      return;
    }

    await page.waitForTimeout(5_000);
  }

  await shot("05-home-after-timeout");
  throw new Error(`За ${REVALIDATE_WAIT_MS / 1000} с «${REGION_NAME}» не появился на главной`);
}

async function run() {
  await mkdir(OUT_DIR, { recursive: true });

  const browser = await chromium.launch(BROWSER_CHANNEL === undefined ? {} : { channel: BROWSER_CHANNEL });
  let failed = false;

  try {
    for (const viewport of VIEWPORTS) {
      const context = await browser.newContext({ viewport, locale: "ru-RU" });
      const page = await context.newPage();
      const shot = (name) =>
        page.screenshot({ path: resolve(OUT_DIR, `${viewport.name}-${name}.png`), fullPage: true });

      try {
        const before = await collectedKopecks();

        await donate(page, shot);

        const growth = (await collectedKopecks()) - before;

        if (growth !== DONATION_KOPECKS) {
          throw new Error(`«Собрано» выросло на ${growth} коп., ожидалось ${DONATION_KOPECKS}`);
        }

        await waitForRegionOnHome(page, shot);
        process.stdout.write(`✓ ${viewport.name}px: оплата прошла, «Собрано» +${growth / 100n} ₽\n`);
      } catch (error) {
        failed = true;
        await shot("99-failure").catch(() => undefined);
        process.stderr.write(`✗ ${viewport.name}px: ${error instanceof Error ? error.message : String(error)}\n`);
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }

  process.stdout.write(`Скриншоты: ${OUT_DIR}\n`);
  process.exitCode = failed ? 1 : 0;
}

await run();
