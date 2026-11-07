# Яндекс Метрика и сквозной учёт пожертвований по UTM — план (фаза 0)

Ветка `feature/yandex-metrika-utm` от `origin/production` (4c2ba3a), worktree `.worktrees/metrika`.
Дата разведки: 27.10.2026.

## 1. Что уже есть (и потому не делается заново)

Большая часть «собственного учёта» из промпта выкачена в прод 21.10.2026:

| Требование промпта | Что в коде | Решение |
| --- | --- | --- |
| Захват UTM, first/last-touch, cookie 90 дней | `apps/web/proxy.ts` + `lib/attribution.ts`: cookie `shamil_ft` / `shamil_lt`, пишутся на сервере до рендера | **Оставляем.** Отдельная cookie `shamil_attr` из промпта задвоила бы учёт и сломала бы атрибуцию у тех, у кого cookie уже стоят |
| Нормализация меток | trim + lower-case, закрытый набор символов, без `@` (e-mail = ПДн) — фронт и `AttributionService` | Оставляем. Длина метки **128**, а не 255: так в колонках `donation.utm_*` с прошлой миграции, расширять тип незачем |
| Колонки атрибуции | в самой `donation` (`utm_*`, `last_utm_*`, `referrer`, `landing_page`, `first_touch_at`) | Новые поля кладём **туда же** (см. §3) |
| `GET /admin/analytics/utm` | есть `GET /admin/analytics/donations-by-source?from&to&model=first\|last&groupBy=…`, раздел админки «Источники» | **Не дублируем.** Добавляем разрез `medium` и долю от суммы |
| Рейтлимит на `POST /donations` | глобальный `ThrottlerGuard` | есть |

Чего нет и что делается в этой ветке:

1. Счётчик Метрики на сайте (SPA-режим, `defer: true`, хиты на смену маршрута), согласие на cookie.
2. Типизированная обёртка `lib/analytics/metrika.ts`, JS-цели формы, «Поделиться», QR, страницы «спасибо».
3. `ymClientId` и `yclid` в теле доната и в БД.
4. Серверные офлайн-конверсии `donation_paid`: outbox-таблица, планировщик, выгрузка CSV в Management API.
5. Документы `GOALS.md`, `DEPLOY.md`, `CHECKLIST_OWNER.md`, CI-воркфлоу.

## 2. Где что живёт (найдено)

- ORM — **Prisma 7** (`apps/api/prisma/schema.prisma`), миграции — `prisma migrate deploy` на старте контейнера.
- Тесты API — Jest + **реальная PostgreSQL** (`describeDatabase`, `TRUNCATED_TABLES`). Тесты web — `node:test` через `tsx`, только `lib/**/*.test.ts`; React Testing Library и Playwright Test в проекте нет (есть пакет `playwright` в корне).
- Переход доната в `paid` — единственное место `PaymentsService.applyEvent` (транзакция): им пользуются и колбэк Robokassa (ResultURL после проверки подписи), и подтверждение ручного доната админом. Ручное поступление «задним числом» (`ManualDonationService.create`) создаёт донат сразу оплаченным, без визита на сайт.
- Публичная лента (`showcase/feed.service.ts`) выбирает поля явным `select` — атрибуция туда не попадает.
- CSP на сайте **нет** (ни заголовков в `next.config.ts`, ни nonce). Helmet стоит только на API.
- Cookie-баннера **нет**; есть страница `/cookie` с политикой (текст заказчика).
- CI (`.github/workflows`) **нет**.

## 3. Схема (аддитивная миграция `20261027180000_metrika_offline_conversions`)

`donation` — две nullable-колонки рядом с остальной атрибуцией:

- `ym_client_id varchar(32)`, CHECK `^[0-9]{1,32}$`;
- `yclid varchar(64)`, CHECK `^[0-9]{1,64}$`.

Почему не отдельная `donation_attribution` 1:1: тринадцать колонок атрибуции уже лежат в `donation`,
и отчёт «Источники» группирует по ним одним индексом. Разнести атрибуцию по двум таблицам ради двух
полей — JOIN в каждом отчёте без выигрыша.

Новая таблица `metrika_offline_conversion` (outbox):

`id, donation_id (unique, FK), target, client_id, yclid, amount_kopecks bigint, currency char(3),
conversion_at, status, skip_reason, uploading_id, attempts, last_error, locked_at, created_at, updated_at`;
индексы `(status, created_at)` и `(uploading_id)`.

Сумма — `amount_kopecks bigint`, а не `decimal` из промпта: защитный тест схемы требует, чтобы все
денежные колонки были копейками в bigint. В рубли с точкой (`Price`) сумма переводится только при сборке CSV.

Статусы: `PENDING → UPLOADING → UPLOADED → PROCESSED`, а также `FAILED`, `SKIPPED`.
`UPLOADING` — добавлен к списку промпта: это «запись забрана инстансом» (см. §5).

Откат — `apps/api/prisma/rollbacks/20261027180000_metrika_offline_conversions.down.sql`
(Prisma не исполняет down-миграции; файл для ручного запуска).

## 4. Переменные окружения

Фронт (вшиваются **при сборке**): `NEXT_PUBLIC_YM_COUNTER_ID`, `NEXT_PUBLIC_YM_ENABLED`,
`NEXT_PUBLIC_YM_REQUIRE_CONSENT` (по умолчанию `true`), `NEXT_PUBLIC_YM_WEBVISOR` (по умолчанию `true`).

Бэк (runtime): `YM_COUNTER_ID`, `YM_OAUTH_TOKEN`, `YM_OFFLINE_ENABLED` (по умолчанию `false`),
`YM_OFFLINE_GOAL` (`donation_paid`), `YM_OFFLINE_INTERVAL_MINUTES` (30).

## 5. Решения, отличающиеся от промпта

| Промпт | Сделано | Почему |
| --- | --- | --- |
| `@nestjs/schedule`, `YM_OFFLINE_CRON` | `setInterval` в жизненном цикле модуля, `YM_OFFLINE_INTERVAL_MINUTES` | Пакета нет в зависимостях; задача — «раз в N минут», cron-выражение не нужно (YAGNI). Таймер `unref()` и останавливается в `onModuleDestroy` |
| `nock` / `msw` для HTTP | адаптер `HttpMetrikaApi` принимает `fetch` параметром, тесты подставляют фейк | Ни одной новой зависимости; сеть в тестах недоступна по построению |
| Защита от параллельного запуска | `UPDATE … WHERE id IN (SELECT … FOR UPDATE SKIP LOCKED) RETURNING` → статус `UPLOADING` | Advisory-lock требует держать одно соединение весь цикл, а Prisma раздаёт запросы по пулу. Захват строк короткой транзакцией не держит соединение во время HTTP. Зависшие `UPLOADING` (инстанс упал) через 15 минут возвращаются в `PENDING` |
| Битая атрибуция → отбросить с `warn` | для **новых** полей `ymClientId`/`yclid` — да; для UTM — по-прежнему 400 | Строгий ответ на битые UTM закреплён e2e-тестами и контрактом прошлого релиза, а фронт сам вычищает метки до отправки. Идентификаторы Метрики приходят из чужого скрипта и URL — их отбрасываем молча |
| `client_id_type` | не передаётся, тип идентификатора задаётся заголовком колонки CSV; ClientId и Yclid — **разными файлами** | В актуальной спецификации метода `upload` параметра нет, а у загрузки (`uploading`) тип идентификатора один на файл |
| `ysclid` | не сохраняется | Офлайн-конверсии принимают ClientId / UserId / Yclid / PurchaseId; `ysclid` (клик из поиска) для сопоставления не используется |
| Захват UTM в `shamil_attr` | без изменений; `yclid` — отдельная cookie `shamil_yclid` на 21 день | Срок = окно сопоставления офлайн-конверсий: дольше хранить незачем |
| `landingPath` / `referrer` в `attribution` | уже передаются как `landingPage` / `referrer` | Имена из прошлого релиза |
| CSP | не меняется | CSP на сайте нет; список доменов Метрики — в `DEPLOY.md` на случай, если её включат |
| Счётчик на всех страницах | на `/admin/**` счётчика и баннера нет | Вебвизор записал бы списки пожертвований и ПДн из карточек; визиты админов искажали бы отчёты |
| `GET /admin/analytics/utm` | расширен существующий `donations-by-source`: `groupBy=medium`; доля и CSV — в админке | Отчёт уже в проде и используется разделом «Источники» |
| `ManualDonationService.create` (поступление задним числом) | в outbox не попадает | Это перевод, внесённый админом по выписке, визита на сайте не было — сопоставлять не с чем |

## 6. Файлы

Новые: `apps/api/src/metrika/**`, миграция и её откат, `apps/web/lib/analytics/{metrika,goals,pageview,consent}.ts`
и тесты, `apps/web/components/analytics/{YandexMetrika,CookieConsent}.tsx`, `docs/metrika/*.md`,
`.github/workflows/ci.yml`.

Меняются: `schema.prisma`, `attribution.dto.ts`, `attribution.service.ts`, `donations.service.ts`,
`payments.service.ts` (+модуль), `app.module.ts`, `config/*`, `analytics.service.ts`/DTO,
`test-database.ts`; во фронте — `layout.tsx`, `proxy.ts`, `lib/attribution.ts`, `useDonationForm.ts`,
форма/QR/«Поделиться»/«спасибо», `lib/api/types.ts`, `.env.example`.

## 7. Риски

- **Юридическая модель согласия.** По умолчанию Метрика грузится только после «Принять»; без согласия
  в Метрике будет часть визитов, офлайн-конверсии — только для давших согласие (`ymClientId` без
  счётчика не появится). Наш учёт в БД от согласия не зависит.
- **21 день.** Окно считается от последнего визита до обработки файла. Мы его приближаем временем
  оплаты: почти все оплаты идут в том же визите. Если выгрузка выключена дольше 21 дня — старые записи
  уйдут в `SKIPPED/expired`.
- **Повторная выгрузка.** Если инстанс упадёт между успешным `upload` и записью `uploading_id`,
  запись вернётся в `PENDING` и уйдёт повторно — возможен дубль конверсии в Метрике (не в деньгах сбора).
- **Вебвизор** пишет экран формы. Поля ПДн помечены `ym-disable-keys`, подписи донатеров в ленте —
  `ym-hide-content`.
