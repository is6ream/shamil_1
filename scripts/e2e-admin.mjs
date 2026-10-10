/**
 * Сквозные сценарии админки на живом API и живом фронте (промпт S11).
 *
 *   1) вход → правка этапа (статус + фото) → изменение на главной;
 *   2) загрузка фото → в галерею → видно на /galereya;
 *   3) ручное поступление 1 000 ₽ → сумма на главной и в дашборде; повтор формы не задваивает;
 *   4) подтверждение перевода по реквизитам;
 *   5) редактор: нет CSV, «Пользователей», «Журнала», вкладки «Реквизиты», ПДн — •••;
 *   6) бухгалтер: CSV скачивается (BOM, «;»), тексты сайта недоступны;
 *   7) истёкший access → тихий refresh; две вкладки не разлогинивают друг друга;
 *   8) новость: черновик → предпросмотр → публикация → /novosti/<slug> → снятие → 404.
 *
 * Нужны запущенные API (с сидом) и фронт. Временные редактор и бухгалтер создаются
 * через API и в конце отключаются; этап, галерея, новость и фото возвращаются как были.
 * Пожертвования из сценариев 3–4 остаются в базе — запускать только на тестовой.
 *
 * Запуск из корня:  node scripts/e2e-admin.mjs
 * Переменные: SITE_URL (http://localhost:3000), API_URL (http://localhost:3001/api),
 * ADMIN_EMAIL / ADMIN_PASSWORD (по умолчанию ADMIN_SEED_* из .env).
 * Сайт и API должны быть на одном site (cookie SameSite=Strict): при API на 192.168.x.x
 * открывайте и сайт по тому же адресу. Вход — 5 попыток в минуту с IP: сценарий
 * входит трижды через браузер и один раз через API.
 */

import { randomBytes } from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { chromium } from "playwright";

const SITE = (process.env.SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const API = (process.env.API_URL ?? "http://localhost:3001/api").replace(/\/$/, "");
const OUT = resolve("Claude outputs/admin-check/e2e");

async function seedCredentials() {
  if (process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD) {
    return { email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD };
  }

  const env = await readFile(resolve(".env"), "utf8");
  const read = (key) => env.match(new RegExp(`^${key}=(.*)$`, "m"))?.[1]?.trim().replace(/^["']|["']$/g, "");

  return { email: read("ADMIN_SEED_EMAIL"), password: read("ADMIN_SEED_PASSWORD") };
}

/* ── API-помощник для подготовки и уборки ─────────────────────────────── */

let token = null;

async function api(method, path, body) {
  const response = await fetch(`${API}${path}`, {
    method,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  const data = text === "" ? null : JSON.parse(text);

  if (!response.ok) {
    throw new Error(`${method} ${path} → ${response.status} ${text.slice(0, 200)}`);
  }

  return data;
}

/* ── Мини-раннер ──────────────────────────────────────────────────────── */

const results = [];

/** Страницы ролей — для снимка при падении сценария. */
const openPages = [];

async function scenario(name, run) {
  const started = Date.now();

  try {
    await run();
    results.push({ name, ok: true, ms: Date.now() - started });
    console.log(`✓ ${name}`);
  } catch (error) {
    results.push({ name, ok: false, error: String(error).split("\n")[0] });
    console.log(`✗ ${name}\n    ${String(error).split("\n")[0]}`);

    for (const [index, page] of openPages.entries()) {
      await page.screenshot({ path: resolve(OUT, `fail-${name.slice(0, 1)}-${index}.png`) }).catch(() => undefined);
    }
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function poll(check, { timeoutMs = 25_000, intervalMs = 1500, what }) {
  const deadline = Date.now() + timeoutMs;

  for (;;) {
    if (await check()) {
      return;
    }

    if (Date.now() > deadline) {
      throw new Error(`не дождались: ${what}`);
    }

    await new Promise((done) => setTimeout(done, intervalMs));
  }
}

async function login(browser, email, password) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "ru-RU", acceptDownloads: true });
  const page = await context.newPage();

  page.on("pageerror", (error) => console.log(`    pageerror: ${String(error).slice(0, 200)}`));
  await go(page, `/admin/login`);
  await page.getByLabel("Электронная почта").fill(email);
  await page.getByLabel("Пароль").fill(password);
  await page.getByRole("button", { name: /Войти/ }).click();
  try {
    await page.waitForURL((url) => !url.pathname.endsWith("/login"), { timeout: 15_000 });
  } catch (error) {
    await page.screenshot({ path: resolve(OUT, `fail-login-${email.split("@")[0]}.png`) });
    throw error;
  }

  return { context, page };
}

/**
 * Переход внутри админки без перезагрузки — кликом по ссылке, если она есть
 * на странице. Полная загрузка = refresh, а у refresh лимит 20/мин с IP:
 * набор из восьми сценариев на `page.goto` в него упирается.
 */
async function go(page, path) {
  const link = page.locator(`a[href="${path}"]`).first();

  if ((await link.count()) > 0 && (await link.isVisible())) {
    await link.click();
    await page.waitForURL((url) => url.pathname === path);
    return;
  }

  await page.goto(`${SITE}${path}`);
}

async function makeJpeg(browser, path, label) {
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });

  await page.setContent(
    `<body style="margin:0;display:grid;place-items:center;height:100vh;background:linear-gradient(135deg,#5b7f95,#111);font:bold 120px sans-serif;color:#fff">${label}</body>`,
  );
  await page.screenshot({ path, type: "jpeg", quality: 85 });
  await page.close();
}

/* ── Сценарии ─────────────────────────────────────────────────────────── */

async function main() {
  await mkdir(OUT, { recursive: true });

  const sa = await seedCredentials();
  const session = await api("POST", "/admin/auth/login", sa);
  token = session.accessToken;

  const runId = Date.now().toString(36);
  const password = `E2e-${randomBytes(9).toString("base64url")}`;
  const editor = await api("POST", "/admin/users", { email: `e2e-editor-${runId}@test.local`, password, role: "EDITOR" });
  const accountant = await api("POST", "/admin/users", {
    email: `e2e-accountant-${runId}@test.local`,
    password,
    role: "ACCOUNTANT",
  });
  const stagesBefore = await api("GET", "/admin/stages");
  const galleryBefore = new Set((await api("GET", "/admin/gallery")).map((item) => item.id));
  const cleanup = { media: [], news: [] };
  const photo = resolve(OUT, `photo-${runId}.jpg`);

  // Web Locks (D-F10) и crypto.randomUUID есть только в безопасном контексте. В проде
  // сайт на HTTPS; dev по http://192.168.x.x таким не считается, и две вкладки
  // гоняют refresh без блокировки. Просим Chromium считать адрес сайта безопасным —
  // так сценарий 7 проверяет продовое поведение.
  const site = new URL(SITE);
  const isSecure = site.protocol === "https:" || ["localhost", "127.0.0.1"].includes(site.hostname);
  const browser = await chromium.launch({
    // Полный Chromium, а не headless-shell: тот игнорирует флаг безопасного origin.
    channel: process.env.PLAYWRIGHT_CHANNEL ?? "chromium",
    args: isSecure ? [] : [`--unsafely-treat-insecure-origin-as-secure=${site.origin}`],
  });
  await makeJpeg(browser, photo, `E2E ${runId}`);

  const ed = await login(browser, editor.email, password);
  const acc = await login(browser, accountant.email, password);
  const admin = await login(browser, sa.email, sa.password);

  openPages.push(ed.page, acc.page, admin.page);

  let transferOrderId = null;

  try {
    await scenario("1. Правка этапа (статус + фото) видна на главной", async () => {
      const { page } = ed;
      const target = stagesBefore[2];

      await go(page, `/admin/media`);
      await page.locator("input[type=file]").setInputFiles(photo);
      await page.getByText("Загружено").first().waitFor({ timeout: 30_000 });

      const media = await api("GET", "/admin/media?page=1&pageSize=1");
      cleanup.media.push(media.items[0].id);

      await go(page, `/admin/stages`);
      await page.getByRole("button", { name: "Изменить" }).nth(2).click();
      await page.getByRole("button", { name: "Добавить фото из медиатеки" }).click();
      await page.getByRole("button", { name: /^Выбрать:/ }).first().click();
      await page.getByRole("button", { name: /^Выбрать \(/ }).click();
      await page.getByRole("combobox", { name: "Статус" }).selectOption("done");
      await page.getByRole("button", { name: "Сохранить", exact: true }).click();
      await page.getByText("Сохранено").first().waitFor();

      const saved = (await api("GET", "/admin/stages")).find((stage) => stage.id === target.id);
      assert(saved.status === "done" && saved.photoMediaIds.length === target.photoMediaIds.length + 1, "этап не сохранился");

      const site = await browser.newPage();
      await poll(
        async () => {
          await site.goto(`${SITE}/`);
          const status = await site.locator("li[data-status]").nth(2).getAttribute("data-status");
          return status === "done";
        },
        { what: "статус этапа на главной" },
      );
      await site.close();
    });

    await scenario("2. Фото → галерея → видно на /galereya", async () => {
      const { page } = ed;

      await go(page, `/admin/gallery`);
      await page.getByRole("button", { name: "Добавить из медиатеки" }).click();
      await page.getByRole("button", { name: /^Выбрать:/ }).first().click();
      await page.getByRole("button", { name: /^Выбрать \(/ }).click();
      await page.getByText(/Добавлено фото: 1/).waitFor();

      const site = await browser.newPage();
      await poll(
        async () => {
          await site.goto(`${SITE}/galereya`);
          return (await site.locator('img[src*="media"]').count()) > 0;
        },
        { what: "фото на /galereya" },
      );
      await site.screenshot({ path: resolve(OUT, "2-galereya.png"), fullPage: true });
      await site.close();
    });

    await scenario("3. Ручное поступление 1 000 ₽: сумма растёт один раз, повтор не задваивает", async () => {
      const { page } = acc;
      const before = BigInt((await api("GET", "/admin/campaign")).collectedKopecks);
      let isFirst = true;

      // Первый ответ «теряется в сети»: сервер запрос обработал, браузер получил ошибку.
      await page.route("**/admin/donations/manual", async (route) => {
        if (isFirst) {
          isFirst = false;
          await route.fetch();
          await route.abort("failed");
          return;
        }

        await route.continue();
      });

      await go(page, `/admin/donations`);
      await page.getByRole("button", { name: "Внести поступление" }).click();
      await page.getByLabel("Сумма, ₽").first().fill("1000");
      await page.getByLabel("Комментарий", { exact: true }).fill(`E2E наличные ${runId}`);

      for (let attempt = 0; attempt < 2; attempt += 1) {
        await page.getByRole("button", { name: "Внести", exact: true }).click();
        await page.getByRole("dialog", { name: "Проверьте сумму" }).getByLabel("Сумма, ₽").fill("1000");
        await page.getByRole("button", { name: "Зачислить" }).click();
        await page.waitForTimeout(1500);
      }

      await page.getByText("уже внесено").first().waitFor({ timeout: 10_000 });
      await page.unroute("**/admin/donations/manual");

      const after = BigInt((await api("GET", "/admin/campaign")).collectedKopecks);
      assert(after - before === 100000n, `сумма выросла на ${after - before} коп., ожидалось 100000`);

      const rubles = new Intl.NumberFormat("ru-RU").format(after / 100n).replace(/\s/g, " ");
      const site = await browser.newPage();
      await poll(
        async () => {
          await site.goto(`${SITE}/`);
          return (await site.content()).includes(rubles);
        },
        { what: `сумма ${rubles} ₽ на главной (≤15 с кеша)`, timeoutMs: 40_000 },
      );
      await site.close();

      await go(page, `/admin`);
      await page.getByText(rubles).first().waitFor();
    });

    await scenario("4. Подтверждение перевода по реквизитам", async () => {
      const created = await fetch(`${API}/donations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amountKopecks: 50000,
          channel: "transfer",
          fullName: "Е2е Тестовый",
          phone: "+79170000000",
          personalDataConsent: true,
        }),
      }).then((response) => response.json());

      transferOrderId = created.orderId;
      assert(typeof transferOrderId === "string", `заказ не создан: ${JSON.stringify(created).slice(0, 200)}`);

      const { page } = acc;
      await go(page, `/admin/donations/${transferOrderId}`);
      await page.getByRole("button", { name: "Подтвердить перевод" }).click();
      await page.getByRole("dialog").getByLabel("Сумма, ₽").fill("500");
      await page.getByRole("dialog").getByRole("button", { name: "Подтвердить", exact: true }).click();
      await page.getByText("Перевод подтверждён").first().waitFor();

      const donation = await api("GET", `/admin/donations/${transferOrderId}`);
      assert(donation.status === "paid" && donation.paidAmountKopecks === "50000", "перевод не подтверждён");
    });

    await scenario("5. Редактор: нет CSV, пользователей, журнала, реквизитов; ПДн — •••", async () => {
      const { page } = ed;

      await go(page, `/admin/donations`);
      await page.getByRole("heading", { name: "Пожертвования" }).waitFor();
      assert((await page.getByRole("button", { name: "Скачать CSV" }).count()) === 0, "у редактора есть CSV");

      const nav = page.getByRole("navigation", { name: "Разделы админки" });
      assert((await nav.getByRole("link", { name: "Пользователи" }).count()) === 0, "в меню есть «Пользователи»");
      assert((await nav.getByRole("link", { name: "Журнал действий" }).count()) === 0, "в меню есть «Журнал»");

      await go(page, `/admin/content`);
      await page.getByRole("tab", { name: "Первый экран" }).waitFor();
      assert((await page.getByRole("tab", { name: "Реквизиты" }).count()) === 0, "у редактора есть вкладка «Реквизиты»");

      if (transferOrderId !== null) {
        await go(page, `/admin/donations/${transferOrderId}`);
        await page.getByText("•••").first().waitFor();
        assert(!(await page.content()).includes("79170000000"), "телефон виден редактору");
      }

      await page.screenshot({ path: resolve(OUT, "5-editor-masked.png"), fullPage: true });
    });

    await scenario("6. Бухгалтер: CSV (BOM, «;»), тексты сайта недоступны", async () => {
      const { page } = acc;

      await go(page, `/admin/donations`);
      const [download] = await Promise.all([
        page.waitForEvent("download"),
        page.getByRole("button", { name: "Скачать CSV" }).click(),
      ]);
      const file = resolve(OUT, download.suggestedFilename());

      await download.saveAs(file);
      const csv = await readFile(file, "utf8");

      assert(/^donations-\d{4}-\d{2}-\d{2}\.csv$/.test(download.suggestedFilename()), "имя файла");
      assert(csv.charCodeAt(0) === 0xfeff, "нет BOM");
      assert(csv.split("\r\n")[0].includes(";"), "разделитель не «;»");

      await go(page, `/admin/content`);
      await page.getByText("Этот раздел недоступен для вашей роли.").waitFor();
    });

    await scenario("7. Тихий refresh при истёкшем access; две вкладки живут вместе", async () => {
      const { context, page } = admin;
      let isExpired = false;

      // Имитация истёкшего access-токена: страница загружена, и следующий запрос
      // списка (от действия человека, а не от монтирования — в dev StrictMode
      // запрос монтирования отменяется) получает 401.
      await go(page, `/admin/donations`);
      await page.getByText(/Найдено \d+/).waitFor();

      let intercepted = 0;
      const isListRequest = (url) => url.pathname.endsWith("/api/admin/donations");

      await page.route(isListRequest, async (route) => {
        intercepted += 1;

        if (intercepted === 1) {
          await route.fulfill({ status: 401, contentType: "application/json", body: '{"message":"Сессия истекла"}' });
          return;
        }

        await route.continue();
      });
      await page.getByRole("combobox", { name: "Статус" }).selectOption("paid");
      await page.getByRole("button", { name: "Показать" }).click();
      await poll(async () => intercepted >= 2, { what: "повтор после refresh", timeoutMs: 10_000, intervalMs: 300 });
      await page.getByText(/Найдено \d+/).waitFor();
      assert(!page.url().endsWith("/login"), "после 401 увело на вход");
      await page.unroute(isListRequest);

      const second = await context.newPage();
      await second.goto(`${SITE}/admin`);
      await second.getByRole("heading", { name: /Здравствуйте/ }).waitFor();

      // Обе вкладки одновременно перезагружаются — оба refresh с одной cookie.
      await Promise.all([page.reload(), second.reload()]);
      await Promise.all([
        page.getByText(/Найдено \d+/).waitFor(),
        second.getByRole("heading", { name: /Здравствуйте/ }).waitFor(),
      ]);
      await go(page, `/admin/goals`);
      await page.getByRole("heading", { name: "Цели сбора" }).waitFor();
      assert(!page.url().endsWith("/login") && !second.url().endsWith("/login"), "вкладки разлогинились");
      await second.close();
    });

    await scenario("8. Новость: черновик → предпросмотр → публикация → /novosti → снятие → 404", async () => {
      const { page } = ed;
      const title = `E2E новость ${runId}`;

      await go(page, `/admin/news/new`);
      await page.getByLabel("Заголовок").fill(title);
      await page.getByRole("textbox", { name: "Текст новости" }).fill("## Проверка\n\nТекст **жирный**.");
      await page.getByText("Так будет на сайте").waitFor();
      assert((await page.locator("strong", { hasText: "жирный" }).count()) > 0, "предпросмотр не отрисовал markdown");
      await page.getByRole("button", { name: "Сохранить черновик" }).click();
      await page.waitForURL(/\/admin\/news\/[0-9a-f-]{36}$/);

      const id = page.url().split("/").pop();
      const post = await api("GET", `/admin/news/${id}`);
      cleanup.news.push(id);

      const status = async () => (await fetch(`${SITE}/novosti/${post.slug}`)).status;
      assert((await status()) === 404, "черновик открывается на сайте");

      await page.getByRole("button", { name: "Опубликовать" }).click();
      await page.getByRole("dialog").getByRole("button", { name: "Опубликовать" }).click();
      await page.getByText("Открыть на сайте").waitFor();
      await poll(async () => (await status()) === 200, { what: "новость открылась" });

      await page.getByRole("button", { name: "Снять с публикации" }).click();
      await page.getByRole("dialog").getByRole("button", { name: "Снять" }).click();
      await page.getByText("Черновик — на сайте не виден").waitFor();
      await poll(async () => (await status()) === 404, { what: "снятая новость — 404" });
    });
  } finally {
    // Уборка: этап, галерея, новость, фото, временные пользователи.
    const target = stagesBefore[2];

    await api("PATCH", `/admin/stages/${target.id}`, { status: target.status, photoMediaIds: target.photoMediaIds }).catch(console.error);

    for (const item of await api("GET", "/admin/gallery")) {
      if (!galleryBefore.has(item.id)) {
        await api("DELETE", `/admin/gallery/${item.id}`).catch(console.error);
      }
    }

    for (const id of cleanup.news) {
      await api("DELETE", `/admin/news/${id}`).catch(console.error);
    }

    for (const id of cleanup.media) {
      await api("DELETE", `/admin/media/${id}`).catch(console.error);
    }

    for (const user of [editor, accountant]) {
      await api("PATCH", `/admin/users/${user.id}`, { isActive: false }).catch(console.error);
    }

    await browser.close();
  }

  const failed = results.filter((result) => !result.ok);

  console.log(`\n${results.length - failed.length}/${results.length} сценариев пройдено`);
  process.exitCode = failed.length === 0 ? 0 : 1;
}

await main();
