# Этапы сбора — анализ перед реализацией (шаг 0)

Дата: 22.10.2026. Ветка `feature/fundraising-goals` от `origin/production` @ 97d2547.

## 1. Пожертвования

Модель `Donation` → таблица `donation` (Prisma, [apps/api/prisma/schema.prisma](../../apps/api/prisma/schema.prisma)).

| Поле | Тип | Смысл |
| --- | --- | --- |
| `status` | enum `donation_status`: `pending`, `paid`, `failed` | `pending → paid` (финально) или `pending → failed`; `failed → paid` разрешён. Обратно в `pending` — никогда. Держит триггер `donation_status_guard_bu`. |
| `amount_kopecks` | `BIGINT` | сумма, которую назвал жертвователь |
| `paid_amount_kopecks` | `BIGINT NULL` | сумма, подтверждённая провайдером или бухгалтером; у `paid` обязательна (CHECK `donation_paid_fields`) |
| `paid_at` | `TIMESTAMPTZ(3) NULL` | момент оплаты |
| `provider` | `VARCHAR(32)` | `manual`, `robokassa`, … |
| `campaign_id` | `UUID` | сбор |

- **Подтверждённым считается только `paid`.** Статуса возврата (`refunded`) в схеме нет — его и учитывать нечего;
  `pending` и `failed` исключаются.
- Деньги везде — целые копейки в `BIGINT`, в API — строкой из цифр.
- Индексы, полезные для агрегации: `donation_status_paid_at_id_idx (status, paid_at DESC, id DESC)` и
  `(campaign_id, status)`. **Новый индекс не нужен** — запрос «собрано» идёт по первому.

## 2. Как фиксируются поступления в manual-режиме

`PAYMENT_PROVIDER=manual`: на сайте QR СБП и реквизиты, деньги приходят мимо сайта. Внести их в базу **можно**:

- `POST /api/admin/donations/manual` — ручное поступление (раздел «Пожертвования» → «Ручное поступление»),
  вставляется сразу в `paid`, витрины пересчитывает триггер;
- `POST /api/admin/donations/:id/confirm` — подтверждение заявки на перевод.

Значит, источник прогресса этапа — обычные `paid`-донаты. Поле **ручной корректировки** нужно для того,
что не хотят вносить построчно (наличные, сводная сумма по выписке, исправление ошибки). Это отражено
подсказками в кабинете: в форме этапа и над таблицей.

## 3. ORM и миграции

- **Prisma 7.10** (`prisma-client` generator, адаптер `@prisma/adapter-pg`). Строка подключения — в `prisma.config.ts`.
- Миграции — `apps/api/prisma/migrations/*/migration.sql`; всё, что Prisma не выражает (CHECK, триггеры,
  частичные индексы), пишется в SQL миграции руками и страхуется тестами схемы.
- **Как применяются на App Platform:** `Dockerfile` API запускает
  `npx prisma migrate deploy && (RUN_SEED=true → сиды) && node dist/main.js` — **автоматически при старте контейнера**.
  Отдельной команды не нужно.

## 4. Авторизация кабинета

- Публичной регистрации нет. Вход — `POST /api/admin/auth/login` (bcrypt, лимит 5/мин на IP), access-JWT
  в заголовке + refresh в httpOnly-cookie.
- Гарды: `JwtAuthGuard` (401 без токена) + `RolesGuard` с `@Roles(...)` (403).
- Роли: `SUPER_ADMIN`, `EDITOR`, `ACCOUNTANT`. Матрица — [apps/api/src/auth/roles.ts](../../apps/api/src/auth/roles.ts):
  цели сбора меняют `GOAL_ROLES` (SA, EDITOR), читают все (`DONATION_READ_ROLES`).
- Глобальный `ThrottlerGuard` (60/мин), админке — `ADMIN_THROTTLE` 300/мин. `ValidationPipe` глобально
  с `whitelist` и `forbidNonWhitelisted`.

## 5. Где hero и форма, как грузятся данные

- Главная — [apps/web/app/page.tsx](../../apps/web/app/page.tsx), серверный компонент, ISR `revalidate = 15`.
  Витрина читается на сервере через `apiGet` (`fetch` с `next.revalidate` и тегами) и `withFallback`:
  если API недоступен, блок деградирует, страница не падает.
- Hero — `HeroIntro` (бейдж, H1, лид, «Собрано», пункты доверия) на тёмном фоне `HeroBackdrop`, класс `.on-dark`.
- Форма — `DonationWidget` → `DonationForm` в `aside#donate`: на десктопе ≥1024 — sticky справа,
  на телефоне идёт после hero. В manual-режиме открыта вкладка «По QR-коду».
- Ревалидация: API после записи шлёт `POST /api/revalidate` с `Bearer REVALIDATE_SECRET`, фронт
  проверяет тег по allowlist и делает `revalidateTag(tag, { expire: 0 })`.

## 6. Что переиспользовать

- **Уже есть раздел «Цели сбора»** (`/admin/goals`): общая цель сбора и цели месяца (`campaign_monthly_goal`).
  Этапы — новая сущность рядом, раздел дополняется секцией, а не заводится второй.
- Шкала прогресса: `ProgressTrack`/`AnimatedTrack` + `.track` в `kit.css` (`translateX`, CSS-анимация),
  хук `useInViewOnce`. Для этапа нужен `scaleX` и счётчик синхронно с полосой — сделан свой компонент,
  хук переиспользован.
- Стеклянных карточек в проекте нет (только `backdrop-filter` у шапки); токены `.on-dark` есть.
- Кабинет: `Section`, `DataTable`, `Pagination`, `Badge`, `Meter`, `Note`, `Modal`, `ConfirmDialog`,
  `TextField`/`TextAreaField`, `useAdminQuery`/`useAdminMutation`, деньги — `lib/admin/money.ts`,
  время по Уфе — `lib/admin/time.ts`.
- `scrollToSection(SECTION_IDS.donate)` — прокрутка к форме с фокусом (уже используют шапка и нижняя плашка).
- Оферта существует: `/oferta` (`PAGES.offer`).

## 7. Исходное состояние (до изменений)

API: typecheck, lint — чисто; `jest` — 44 набора, 537 тестов зелёные (на отдельной базе `shamil_goals_test`).
Web: lint, tsc — чисто; `npm test` — 175 тестов зелёные. Стоп-условий нет.
