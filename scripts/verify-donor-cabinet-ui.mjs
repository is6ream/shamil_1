import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const base = new URL(process.env.SITE_URL ?? 'http://127.0.0.1:3001');
assert.ok(['localhost', '127.0.0.1'].includes(base.hostname), 'Use only a local test server');
const out = process.env.CABINET_OUTPUT_DIR ?? 'output/playwright/donor-cabinet-ui';
const before = process.argv.includes('--before');
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}) });
const subscriptions = [
  { id: 'monthly', amountKopecks: '50000', frequency: 'monthly', state: 'active', nextAt: '2026-12-17T09:00:00Z', firstPayment: 'paid', latestAttempt: { state: 'paid' } },
  { id: 'friday', amountKopecks: '10000', frequency: 'every_friday', state: 'active', nextAt: null, firstPayment: 'paid', latestAttempt: { state: 'unknown' } },
];
const results = [];
try {
  for (const width of before ? [1440, 390] : [1440, 768, 390, 320]) {
    const context = await browser.newContext({ viewport: { width, height: width < 500 ? 844 : 1000 } });
    let signedIn = true, empty = false, fail = '', cancelled = false, slow = false;
    const calls = [];
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      return ['localhost', '127.0.0.1'].includes(url.hostname) ? route.continue() : route.abort();
    });
    await context.route('**/api/donor/**', async route => {
      const url = new URL(route.request().url());
      const path = url.pathname.replace('/api/donor/', '');
      calls.push(path + url.search);
      if (slow) await new Promise(resolve => setTimeout(resolve, 600));
      if (path === fail) return route.fulfill({ status: 503, json: { error: { code: 'SERVICE_UNAVAILABLE', message: 'Сервис временно недоступен. Попробуйте позже.' } } });
      if (path === 'auth/session' && !signedIn) return route.fulfill({ status: 401, json: { error: { code: 'AUTH_REQUIRED' } } });
      if (path === 'auth/logout') signedIn = false;
      if (path === 'auth/verify') {
        if (route.request().postDataJSON().code !== '123456') return route.fulfill({ status: 400, json: { error: { message: 'Неверный код. Проверьте письмо и попробуйте снова.' } } });
        signedIn = true;
      }
      let data = {};
      if (path === 'auth/request-code') data = { challengeId: 'synthetic-challenge', retryAfterSeconds: 1 };
      if (path.endsWith('/cancel')) { cancelled = true; return route.fulfill({ json: { ...subscriptions[0], state: 'cancelled', nextAt: null } }); }
      if (path === 'subscriptions') data = { items: empty ? [] : url.search ? [{ ...subscriptions[0], id: 'older', state: 'cancelled', nextAt: null }] : subscriptions.map((s, i) => i === 0 && cancelled ? { ...s, state: 'cancelled', nextAt: null } : s), nextCursor: empty || url.search ? null : 'page2' };
      if (path.endsWith('/history')) data = { items: url.search ? [{ orderId: 'h2', kind: 'repeat', status: 'pending', operationState: 'unknown', amountKopecks: '50000', paidAt: null }] : [{ orderId: 'h1', kind: 'first', status: 'paid', operationState: null, amountKopecks: '50000', paidAt: '2026-11-17T09:00:00Z' }], nextCursor: url.search ? null : 'history2' };
      return route.fulfill({ json: data });
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    async function capture(name) {
      await page.evaluate(() => document.fonts.ready);
      await page.addStyleTag({ content: 'nextjs-portal {display:none !important}' });
      await page.evaluate(() => { document.documentElement.style.scrollBehavior = 'auto'; window.scrollTo(0, 0); });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, name + ' overflow');
      await page.screenshot({ path: `${out}/${name}-${width}.png`, fullPage: true, animations: 'disabled' });
    }
    await page.goto(new URL('/donor', base).href);
    await page.getByRole('button', { name: 'История платежей', exact: true }).first().waitFor();
    await capture(before ? 'before' : 'cabinet');
    if (before) { await context.close(); continue; }
    assert.equal(await page.getByRole('button', { name: 'Обновить состояние' }).count(), 0);
    assert.equal(await page.getByRole('button', { name: 'Выбрать регулярное пожертвование' }).count(), 0);
    const first = page.getByRole('article').first();
    await first.getByRole('button', { name: 'История платежей', exact: true }).click();
    await first.getByRole('listitem').getByText('Первый платёж', { exact: true }).waitFor();
    await first.getByRole('button', { name: 'Ещё платежи' }).click();
    await first.getByText('Повторный платёж', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Показать ещё' }).click();
    await page.getByRole('article').nth(2).waitFor();
    await first.getByRole('button', { name: 'Отключить автосписания', exact: true }).click();
    await capture('history-confirm');
    fail = 'subscriptions/monthly/cancel';
    await first.getByRole('button', { name: 'Подтвердить отключение' }).click();
    await first.getByRole('alert').waitFor();
    assert.equal(cancelled, false);
    await capture('cancel-error');
    fail = ''; slow = true;
    await first.getByRole('button', { name: 'Подтвердить отключение' }).click();
    await first.getByText('Отключаем…', { exact: true }).waitFor();
    await first.getByText('Будущие списания отключены', { exact: true }).waitFor();
    slow = false;
    assert.ok(calls.filter(c => c === 'subscriptions').length >= 2, 'refresh after cancel');
    await capture('cancelled');
    empty = true;
    await page.reload(); await page.getByText('Автоплатежей пока нет.', { exact: true }).waitFor();
    await capture('empty');
    await page.getByRole('button', { name: 'Выйти', exact: true }).click();
    await page.getByLabel('Email', { exact: true }).fill('donor@example.test');
    await capture('login');
    await page.getByLabel('Email', { exact: true }).press('Enter');
    const code = page.getByLabel('Код из письма', { exact: true });
    await code.waitFor();
    assert.equal(await code.evaluate(el => el === document.activeElement), true, 'code autofocus');
    await code.fill('000000'); await code.press('Enter');
    await page.locator('main [role="alert"]').waitFor(); await capture('code-error');
    await code.fill('123456'); empty = false; await code.press('Enter');
    await page.getByRole('article').first().waitFor();
    fail = 'subscriptions'; await page.reload(); await page.locator('main [role="alert"]').waitFor(); await capture('list-error');
    assert.equal(await page.getByText('Автоплатежей пока нет.', { exact: true }).count(), 0);
    fail = ''; await page.reload(); await page.getByRole('article').first().waitFor();
    const historyButton = page.getByRole('button', { name: 'История платежей', exact: true }).first();
    await historyButton.focus(); await page.keyboard.press('Tab'); await page.keyboard.press('Shift+Tab');
    assert.equal(await historyButton.evaluate(el => getComputedStyle(el).outlineStyle !== 'none'), true, 'visible keyboard focus');
    await capture('focus');
    assert.deepEqual(errors, [], 'browser exceptions');
    results.push({ width, passed: 'automatic list, pagination, history, cancellation failure/success/refresh, empty, logout, email/code/Enter/focus, list failure, no overflow', synthetic: true });
    await writeFile(`${out}/checks.json`, JSON.stringify(results, null, 2));
    await context.close();
  }
  await writeFile(`${out}/${before ? 'before' : 'checks'}.json`, JSON.stringify(results, null, 2));
  console.log(results);
} finally { await browser.close(); }
