/** Browser checks with mocked payment responses; never creates real orders. */
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright";

const site = new URL(process.env.SITE_URL ?? "http://localhost:3310");
assert(["localhost", "127.0.0.1"].includes(site.hostname), "Use a local frontend only");
const out = resolve(process.env.PAYMENT_CHECK_OUTPUT_DIR ?? "output/playwright/payment-status");
const orderId = "11111111-2222-4333-8444-555555555555";
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL ?? "chrome" });
const results = [];

try {
  for (const width of [390, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    const page = await context.newPage();
    let mode = "paid";
    let paidAfter = 0;
    let submits = 0;
    // Intercept every browser API request, so these checks cannot write to a server.
    await page.route("**/api/**", async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname.endsWith(`/donations/${orderId}/status`)) {
        if (mode === "offline") return route.abort("failed");
        if (mode === "hanging") return;
        const status = mode === "failed" ? "failed" : Date.now() >= paidAfter ? "paid" : "pending";
        return route.fulfill({ json: {
          orderId, status, amountKopecks: "10000",
          paidAmountKopecks: status === "paid" ? "10000" : null,
          paidAt: status === "paid" ? "2026-11-03T00:00:00.000Z" : null,
        } });
      }
      if (route.request().method() === "POST" && url.pathname.endsWith("/donations")) {
        submits += 1;
        return route.abort("failed");
      }
      return route.fulfill({ status: 503, json: { message: "Test API unavailable" } });
    });
    const openStatus = () => page.goto(new URL(`/spasibo?Shp_order_id=${orderId}`, site).href, {
      waitUntil: "domcontentloaded",
    });
    const confirmed = page.getByText("Платёж подтверждён", { exact: true });

    await openStatus();
    await confirmed.waitFor();
    await page.screenshot({ path: resolve(out, `${width}-paid.png`), fullPage: true });
    results.push(`${width}: callback before return -> paid`);

    mode = "offline";
    await openStatus();
    await page.getByRole("heading", { name: "Подтверждение ещё не получено" }).waitFor();
    assert.equal(await confirmed.count(), 0);
    await page.screenshot({ path: resolve(out, `${width}-offline.png`), fullPage: true });
    mode = "paid";
    await page.getByRole("button", { name: "Проверить ещё раз" }).click();
    await confirmed.waitFor();
    results.push(`${width}: unavailable API -> uncertain; retry -> paid`);

    await page.goto(new URL("/spasibo", site).href, { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: "Здесь показывается статус платежа" }).waitFor();
    assert.equal(await confirmed.count(), 0);
    results.push(`${width}: no order id -> no confirmation`);

    mode = "failed";
    await openStatus();
    await page.getByRole("heading", { name: "Платёж пока не подтверждён" }).waitFor();
    mode = "paid";
    await page.getByRole("button", { name: "Проверить ещё раз" }).click();
    await confirmed.waitFor();
    results.push(`${width}: failed -> retry -> late paid`);

    if (width === 390) {
      mode = "hanging";
      await openStatus();
      await page.getByRole("heading", { name: "Подтверждение ещё не получено" }).waitFor({ timeout: 15_000 });
      assert.equal(await confirmed.count(), 0);
      results.push("390: hanging status request -> bounded timeout, no payment confirmation");
      mode = "paid";
      paidAfter = Date.now() + 10_000;
      await openStatus();
      await page.getByRole("heading", { name: "Спасибо. Проверяем перевод" }).waitFor();
      assert.equal(await confirmed.count(), 0);
      await confirmed.waitFor({ timeout: 20_000 });
      results.push("390: callback after 10 seconds -> paid");

      paidAfter = Date.now() + 45_000;
      await openStatus();
      await page.getByRole("heading", { name: "Подтверждение ещё не получено" }).waitFor({ timeout: 40_000 });
      assert.equal(await confirmed.count(), 0);
      await page.screenshot({ path: resolve(out, "390-timeout.png"), fullPage: true });
      await new Promise((done) => setTimeout(done, Math.max(0, paidAfter - Date.now()) + 100));
      await page.getByRole("button", { name: "Проверить ещё раз" }).click();
      await confirmed.waitFor();
      results.push("390: callback after 45 seconds -> UI timeout -> retry -> paid");
      paidAfter = 0;
    }

    // Проверяем форму после готовности DOM; внешние изображения и виджеты
    // главной не должны блокировать платёжный сценарий ожиданием load.
    await page.goto(site.href, { waitUntil: "domcontentloaded" });
    // Production retains its QR/form tabs; the WIP page opens the form directly.
    const formTab = page.getByRole("tab", { name: "Через форму", exact: true });
    if (await formTab.count()) await formTab.click();
    await page.locator("#donation-consent").check({ force: true });
    await page.getByRole("button", { name: /Пожертвовать/ }).first().click();
    await page.getByRole("alert").filter({ hasText: "Не получилось связаться с сервером" }).waitFor();
    assert.equal(submits, 1);
    assert(!page.url().includes("/spasibo"));
    await page.screenshot({ path: resolve(out, `${width}-submit-offline.png`), fullPage: true });
    results.push(`${width}: create-order API failure -> form error, no success redirect`);
    await context.close();
  }
  console.log(JSON.stringify({ passed: results.length, results }, null, 2));
} finally {
  await browser.close();
}
