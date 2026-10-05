# Ревью схемы БД mechetshamil.ru

Дата: 05.10.2026. Режим — только чтение: код, схема и БД не менялись, миграции не запускались,
к базе не подключались. Диаграмма — [er-diagram.md](er-diagram.md) / [er-diagram.html](er-diagram.html).

## Источники

| Источник | Путь | Статус |
| --- | --- | --- |
| Prisma-схема | `apps/api/prisma/schema.prisma` | основной источник; 9 моделей, 2 enum |
| Миграции | `apps/api/prisma/migrations/` — `init`, `guards_and_stats`, `stats_apply_without_upsert`, `donation_invoice_no` | 4 шт., ручной SQL во 2–4 |
| Копии в worktree | `.worktrees/{admin-manual-confirm, payments-remove-receipt, web-payment-flow}` | побайтно совпадают с основной |
| TypeORM / MikroORM / Sequelize / Mongoose | — | не найдено |
| Описание | `docs/db-schema.md` | частично устарело (см. «Расхождения») |

## Сущности

| Таблица | Назначение | Ключевые поля | Связей |
| --- | --- | --- | --- |
| `campaign` | Сбор: общая цель, валюта, мин. донат | `slug` UK, `goal_kopecks`, `min_donation_kopecks` | 4 |
| `campaign_stats` | Витрина «собрано» сбора | `paid_total_kopecks`, `paid_count` | 1 |
| `campaign_monthly_goal` | Цель месяца с периодом | `period_start/end`, `goal_kopecks`, `collected_kopecks` | 1 |
| `region` | Справочник страна → субъект РФ | `type`, `parent_id`, `slug` UK, `is_ranked` | 4 (вкл. самоссылку) |
| `region_stats` | Витрина рейтинга землячеств | `paid_total_kopecks` (индекс DESC) | 1 |
| `donation` | Донат, `pending → paid` | `invoice_no` UK, `status`, `amount_kopecks`, `paid_amount_kopecks`, `provider` | 4 |
| `donation_contact` | ПДн донатера (152-ФЗ) | `phone_e164`, `full_name`, `personal_data_consent_at` | 1 |
| `payment_event` | Журнал колбэков, идемпотентность | UK(`provider`, `provider_event_id`), `payload`, `applied_at` | 1 |
| `gallery_item` | Фото стройки | `image_url`, `taken_on`, `width/height` | 1 |

## Что уже хорошо

Чтобы не искать проблемы там, где их нет:

- Деньги — `bigint` в копейках во всех таблицах, плавающей точки нет.
- Идемпотентность вебхука: UK(`provider`, `provider_event_id`) в `payment_event` плюс UK на
  `donation.invoice_no` и UK(`provider`, `provider_payment_id`). Повтор колбэка упирается
  в индекс → `duplicate`, донат не задваивается.
- Переход статусов, «paid ⇒ есть сумма и время», анонимность без подписи — в БД (CHECK +
  триггер), а не только в сервисе.
- Все FK покрыты индексами (ведущей колонкой составного): `donation.campaign_id`,
  `donation.region_id`, `payment_event.donation_id`, `gallery_item.campaign_id`,
  `campaign_monthly_goal.campaign_id`, `region.parent_id`; у `*_stats` и `donation_contact`
  FK = PK.
- ПДн отделены: телефон и ФИО только в `donation_contact`, `email` в `payment_event.payload`
  заменяется маркером.

## Проблемы и риски

По убыванию важности.

### 1. Цель месяца не продлевается и не добирает прошлые платежи — ВЫСОКИЙ

- Строку `campaign_monthly_goal` создаёт только сид, на текущий месяц. Эндпоинта админки для неё
  нет. 1 ноября `GET /campaign` вернёт `monthlyGoal: null`, и верхняя шкала прогресс-бара
  пропадёт. По CLAUDE.md при цели 240 млн только эта шкала не даёт первому экрану выглядеть
  провалом.
- `collected_kopecks` пополняет только триггер при оплате. Если цель месяца завести, когда
  в этом периоде уже есть платежи, они не учтутся: шкала начнётся с нуля. Пересчёта задним
  числом нет.
- Рекомендация: эндпоинт админки, который создаёт цель и в той же транзакции считает
  `collected_kopecks = SUM(paid_amount_kopecks)` за период (по `paid_at` в Europe/Moscow, как
  в триггере). Либо считать «собрано за месяц» запросом, а не хранить.

### 2. Денормализованные витрины без сверки — СРЕДНИЙ/ВЫСОКИЙ

- `campaign_stats`, `region_stats`, `campaign_monthly_goal.collected_kopecks` держатся только
  на триггере. Если кто-то вручную выполнит `ALTER TABLE … DISABLE TRIGGER`, сделает
  `TRUNCATE` или восстановит базу частично, суммы на сайте молча разойдутся с `donation`.
- Рекомендация: read-only проверка (cron или тест на стенде) —
  `SUM(paid_amount_kopecks) WHERE status='paid'` против `campaign_stats` и `region_stats`,
  с алертом при расхождении.

### 3. Ключ идемпотентности Robokassa = номер счёта из локальной последовательности — СРЕДНИЙ

- `provider_event_id` для Robokassa — это `InvId`, то есть `donation.invoice_no` (SERIAL).
  Если последовательность начнётся заново (база пересоздана, восстановлена из старого дампа)
  или два окружения работают с одним магазином Robokassa, новый донат может получить уже
  использованный номер. Его оплата упрётся в старое событие, получит `duplicate`, и донат
  тихо останется в `pending`, хотя деньги пришли.
- Для справки: в `schema.prisma` и в `docs/db-schema.md` написано, что ключом служит хеш тела.
  В коде (`robokassa.provider.ts`) ключ — `InvId`.
- Рекомендация: отдельные магазины Robokassa или непересекающиеся диапазоны
  `invoice_no` на окружение; при `duplicate`, если донат ещё `pending`, — логировать как
  ошибку, а не как обычный повтор.

### 4. ПДн хранятся без срока и для брошенных заказов — СРЕДНИЙ (152-ФЗ)

- `donation_contact` создаётся при `POST /donations`, до оплаты. Для брошенных `pending`
  ФИО, телефон и `consent_ip` остаются навсегда. Политики хранения и очистки нет.
- `consent_ip` (`inet`) — ещё одна категория данных. Нужна ли она как доказательство согласия,
  должен решить юрист.
- `payment_event.payload`: из тела скрывается только поле `email` (denylist). Если провайдер
  добавит в колбэк другое поле с ПДн, оно сохранится в JSON, который удаление
  `donation_contact` не чистит. Надёжнее allowlist полей.
- Рекомендация: зафиксировать срок хранения (например, удалять контакт `pending/failed`
  через N дней) и перейти на allowlist для `payload`.

### 5. Нет жизненного цикла для `pending` — НИЗКИЙ/СРЕДНИЙ

- Статус `failed` разрешён схемой, но его никто не ставит: Robokassa присылает только
  успешные колбэки. Брошенные заказы копятся в `pending` бесконечно.
- Индекса на `donation(status, created_at)` для такой очистки нет. Пока объёмы небольшие,
  это не важно.

### 6. Поля и индексы, которые не используются — НИЗКИЙ

| Поле / объект | Использований в `apps/api/src` | Комментарий |
| --- | --- | --- |
| `donation.recurring_id` + `donation_recurring_id_idx` | 0 | см. раздел о регулярных пожертвованиях |
| `donation.charged_currency` | 0 (всегда default `RUB`) | задел под Kaspi/Mbank |
| `donation.charged_amount_minor` | 0 | задел под Kaspi/Mbank; курса пересчёта в схеме нет — понадобится при интеграции |
| `campaign.currency` | только default | одна валюта учёта |
| индекс `campaign_monthly_goal(campaign_id, period_start, period_end)` | — | дублирует UK(`campaign_id`, `period_start`) и gist-индекс EXCLUDE |

### 7. Мягкие перечисления без CHECK — НИЗКИЙ

`donation.provider`, `donation.method`, `payment_event.provider` — это `varchar` без CHECK
(у `region_source` CHECK есть). Опечатка в коде провайдера создаст «нового провайдера» и разобьёт
UK(`provider`, …). Рекомендация: CHECK со списком значений, его проще менять, чем enum.

### 8. Мелочи — НИЗКИЙ

- Индексы ленты и топа донатеров (`status, paid_at`, `status, is_anonymous, paid_amount`) не
  начинаются с `campaign_id`. Для одного сбора это нормально; со вторым сбором понадобится
  префикс.
- `updated_at` двигает Prisma (`@updatedAt`). Изменения из raw SQL и триггеров `donation.updated_at`
  не обновляют.
- `provider_payment_id` записывается вторым `UPDATE` после создания доната, не атомарно.
  Это безопасно, потому что колбэк ищет донат по `invoice_no`, но поле может остаться пустым.
- Nullable-поля, которые стоило бы сделать NOT NULL, не найдены. Все nullable поля обоснованы
  (`region_id`, `donor_name`, `payment_event.donation_id` для неизвестного счёта).

## Поля регулярных пожертвований (кандидаты на удаление)

В БД нет `frequency` / `subscription` / периодичности. Со стороны схемы остаётся только резерв:

| Объект | Где |
| --- | --- |
| колонка `donation.recurring_id uuid NULL` | `schema.prisma` (`recurringId`), миграция `init` |
| индекс `donation_recurring_id_idx` | `@@index([recurringId])`, миграция `init` |
| `COMMENT ON COLUMN donation.recurring_id` | миграция `guards_and_stats` |

Фронтенд и DTO уже очищены: `create-donation.dto.spec.ts` проверяет, что поля `recurrence` и
`frequency` дают 400. Учтите, что CLAUDE.md («место под `recurring_id`») прямо требует
оставить колонку, чтобы потом не мигрировать боевую таблицу. Удалять её — значит отменить
это решение, и сделать это должен заказчик. Если удалять, то новой миграцией:
`DROP INDEX` → `DROP COLUMN`; поле сейчас всегда `NULL`, данные не теряются.

## Расхождения

| Что сравнивалось | Результат |
| --- | --- |
| `schema.prisma` ↔ сумма 4 миграций | Расхождений в таблицах, колонках, типах, default, индексах и FK нет (сверено вручную). Единственное отличие — `invoice_no` в БД стоит последней колонкой, в модели в середине. На работу это не влияет. `prisma migrate diff` не запускался: ему нужна shadow-БД, а режим был только на чтение. |
| Объекты из ручного SQL (CHECK, EXCLUDE, триггеры, частичный UNIQUE) | В Prisma их нет — это ожидаемо, они задокументированы в шапке `schema.prisma`, а их наличие проверяет `schema-guards.spec.ts`. При следующей `migrate dev` проверьте, что Prisma их не удаляет. |
| Основная ветка ↔ worktree | Совпадают. |
| Документация ↔ код | Комментарий к `PaymentEvent.providerEventId` в `schema.prisma` и `docs/db-schema.md` описывают ключ как хеш тела, а в коде это `InvId`. В `docs/db-schema.md` нет колонки `invoice_no`. |
