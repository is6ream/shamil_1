import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';

const base = process.env.SITE_URL ?? 'http://127.0.0.1:3366';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname));
const out = process.env.CONSENT_OUTPUT_DIR ?? 'output/playwright/recurring-consent';
await mkdir(out, { recursive: true });
const browser = await chromium.launch();
const results = [];
try {
  for (const width of [390, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: 1000 }, hasTouch: width === 390 });
    let signedIn = false, active = false, version = 'test-v1', sessionChecks = 0;
    let releaseCheckout;
    const posts = [], errors = [];
    await context.route('**/*', async route => {
      const request = route.request(), url = new URL(request.url());
      if (url.origin !== base) return route.abort();
      if (!url.pathname.startsWith('/api/')) return route.continue();
      if (request.method() === 'POST') posts.push({ path: url.pathname, body: request.postDataJSON() });
      if (url.pathname === '/api/donations/capabilities') return route.fulfill({ json: { online: true, recurring: active ? {
        version, termsUrl: '/oferta#recurring-payments', cancellationUrl: '/donor',
        dates: { daily: '2026-11-19', every_friday: '2026-11-20', monthly: '2026-12-18' }, minKopecks: '10000', maxKopecks: '10000000',
      } : null } });
      if (url.pathname === '/api/donor/auth/session') {
        sessionChecks++;
        return route.fulfill({ status: signedIn ? 200 : 401, json: signedIn ? {} : { error: { code: 'AUTH_REQUIRED' } } });
      }
      if (url.pathname === '/api/donor/auth/request-code') return route.fulfill({ json: { challengeId: 'synthetic', retryAfterSeconds: 1 } });
      if (url.pathname === '/api/donor/auth/verify') { signedIn = true; return route.fulfill({ json: {} }); }
      if (url.pathname === '/api/donations/recurring/checkout') {
        await new Promise(resolve => { releaseCheckout = resolve; });
        return route.fulfill({ status: 503, json: { error: { code: 'SERVICE_UNAVAILABLE', message: 'Synthetic intercepted checkout' } } });
      }
      return route.fulfill({ status: 503, json: {} });
    });
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    console.log('opening', width);
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 30000 });
    console.log('loaded', width);
    await page.getByText('Автоплатёж', { exact: true }).click();
    await page.getByRole('button', { name: 'Войти по email', exact: true }).waitFor();
    const checkbox = page.locator('#recurring-consent');
    const checked = async value => assert.equal(await checkbox.isChecked(), value);
    console.log('closed checkout', width);
    await checked(false); assert.equal(await checkbox.isEnabled(), true);
    if (width === 390) { await checkbox.scrollIntoViewIfNeeded(); await checkbox.tap(); } else await checkbox.click();
    await checked(true);
    await checkbox.press('Space'); await checked(false);
    await checkbox.press('Space'); await checked(true);
    const checkSession = async () => {
      const response = page.waitForResponse(r => r.url().endsWith('/api/donor/auth/session'));
      await page.evaluate(() => window.dispatchEvent(new Event('focus'))); await response;
      await page.getByRole('button', { name: 'Войти по email', exact: true }).waitFor({ state: signedIn ? 'hidden' : 'visible' });
    };
    await checkSession(); await checked(true);
    await page.locator('#donation-amount').fill('700'); await checked(false);
    await checkbox.check(); await page.locator('label').filter({ has: page.locator('input[name="frequency"][value="daily"]') }).click(); await checked(false);
    await checkbox.check();
    await page.locator('#donation-amount').press('Enter');
    assert.equal(await page.getByRole('button', { name: /Оформить автоплатёж/ }).count(), 0);
    assert.equal(posts.length, 0, 'local consent and Enter send no POST');
    const consentLink = page.locator('label[for="recurring-consent"] a[href="/soglasie"]');
    const offerLink = page.locator('label[for="recurring-consent"] a[href="/oferta#recurring-payments"]');
    assert.equal(await consentLink.count(), 1); assert.equal(await offerLink.count(), 1);
    for (const path of ['/soglasie', '/oferta#recurring-payments']) {
      const linkPage = await context.newPage(); const response = await linkPage.goto(base + path);
      assert.equal(response.status(), 200); if (path.includes('#')) assert.equal(await linkPage.locator('#recurring-payments').count(), 1);
      await linkPage.close();
    }
    await checkbox.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${out}/closed-${width}.png`, fullPage: false });
    // A real authentication transition resets preview consent even while checkout stays closed.
    signedIn = true; await checkSession(); await checked(false);
    await checkbox.check(); await checkSession(); await checked(true);
    signedIn = false; await checkSession(); await checked(false);
    await checkbox.check(); await checkSession(); await checked(true);
    // Login and refreshed server conditions are fully synthetic; no email leaves this browser.
    console.log('synthetic login', width);
    active = true;
    await page.getByRole('button', { name: 'Войти по email', exact: true }).click();
    await page.getByLabel('Email', { exact: true }).fill('donor@example.test');
    await page.getByRole('button', { name: 'Получить код', exact: true }).click();
    await page.getByLabel('Код из письма', { exact: true }).fill('123456');
    await page.getByRole('button', { name: 'Войти', exact: true }).click();
    const submit = page.getByRole('button', { name: /Оформить автоплатёж/ });
    await submit.waitFor(); await checked(false);
    await submit.click(); assert.equal(posts.filter(p => p.path.endsWith('/checkout')).length, 0);
    await checkbox.check(); await checkSession(); await checked(true);
    // Changed conditions after an authenticated refresh require fresh consent.
    signedIn = false; await checkSession();
    await checkbox.check(); version = 'test-v2';
    await page.getByRole('button', { name: 'Войти по email', exact: true }).click();
    await page.getByLabel('Email', { exact: true }).fill('donor@example.test');
    await page.getByRole('button', { name: 'Получить код', exact: true }).click();
    await page.getByLabel('Код из письма', { exact: true }).fill('123456');
    await page.getByRole('button', { name: 'Войти', exact: true }).click();
    await page.getByText('Email подтверждён. Проверьте условия и подтвердите отдельное согласие.', { exact: true }).waitFor();
    console.log('synthetic checkout', width);
    await checked(false); await checkbox.check();
    await Promise.all([page.waitForRequest(r => r.url().endsWith('/checkout')), submit.click()]);
    assert.equal(posts.filter(p => p.path.endsWith('/checkout')).length, 1);
    assert.equal(posts.at(-1).body.accepted, true); assert.equal(posts.at(-1).body.version, 'test-v2');
    assert.equal(await checkbox.isEnabled(), false, 'consent locked while submitting');
    releaseCheckout(); await page.getByText('Synthetic intercepted checkout', { exact: true }).waitFor();
    await page.getByText('Разовое пожертвование', { exact: true }).click();
    assert.equal(await page.locator('#recurring-consent').count(), 0);
    const once = page.locator('#donation-consent'); await once.uncheck(); await once.check(); assert.equal(await once.isChecked(), true);
    assert.deepEqual(errors, []);
    results.push({ width, sessionChecks, checkout: 'one intercepted synthetic request', errors });
    await context.close();
  }
} catch (error) { console.error(error); throw error; } finally { await browser.close(); }
await writeFile(`${out}/results.json`, JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));
