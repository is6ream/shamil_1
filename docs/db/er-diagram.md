# ER-диаграмма БД mechetshamil.ru

Источник правды — [apps/api/prisma/schema.prisma](../../apps/api/prisma/schema.prisma) и четыре
миграции в [apps/api/prisma/migrations/](../../apps/api/prisma/migrations/). Состояние на 05.10.2026.
Имена таблиц и колонок — реальные, как в PostgreSQL (`@@map` / `@map`).

Пометки: **PK** — первичный ключ, **FK** — внешний ключ, **UK** — входит в уникальное
ограничение (одиночное или составное — см. комментарий). `?` в комментарии — колонка nullable.
Деньги везде — `bigint` в копейках (`*_kopecks`) или в минимальных единицах валюты (`*_minor`).

Сущностей 9 (меньше 12), поэтому отдельная обзорная диаграмма по доменам не нужна — домены
подписаны в таблице ниже.

| Домен | Таблицы |
| --- | --- |
| Сбор и витрины | `campaign`, `campaign_stats`, `campaign_monthly_goal` |
| Платежи / пожертвования | `donation`, `payment_event` |
| ПДн (152-ФЗ) | `donation_contact` |
| Справочники | `region`, `region_stats` |
| Контент | `gallery_item` |

Пользователей/аккаунтов в схеме нет: личного кабинета в MVP нет, админка — по токену.

```mermaid
erDiagram
    campaign {
        uuid id PK "gen_random_uuid()"
        varchar slug UK "64"
        varchar title "200"
        bigint goal_kopecks "CHECK > 0"
        char currency "3, default RUB"
        bigint min_donation_kopecks "default 10000"
        boolean is_active "default true"
        timestamptz created_at
        timestamptz updated_at
    }

    campaign_stats {
        uuid campaign_id PK, FK "1:1 с campaign"
        bigint paid_total_kopecks "default 0, триггер"
        int paid_count "default 0, триггер"
        timestamptz last_paid_at "?"
        timestamptz updated_at
    }

    campaign_monthly_goal {
        uuid id PK
        uuid campaign_id FK, UK "UK(campaign_id, period_start)"
        date period_start UK
        date period_end "EXCLUDE: периоды не пересекаются"
        bigint goal_kopecks "CHECK > 0"
        bigint collected_kopecks "default 0, триггер"
        timestamptz created_at
        timestamptz updated_at
    }

    region {
        uuid id PK
        region_type type "enum: country | subject"
        uuid parent_id FK "? субъект -> страна"
        char country_code UK "2, UK(country_code, code)"
        varchar code UK "8, ? код субъекта"
        varchar slug UK "32, сегмент URL"
        varchar name "120"
        varchar flag_url "500, ?"
        int sort_order "default 100"
        boolean is_active "default true"
        boolean is_ranked "default true"
        timestamptz created_at
        timestamptz updated_at
    }

    region_stats {
        uuid region_id PK, FK "1:1 с region"
        bigint paid_total_kopecks "default 0, триггер"
        int paid_count "default 0, триггер"
        timestamptz last_paid_at "?"
        timestamptz updated_at
    }

    donation {
        uuid id PK "публичный order_id"
        int invoice_no UK "SERIAL, InvId Robokassa"
        uuid campaign_id FK
        uuid region_id FK "? nullable намеренно"
        donation_status status "enum: pending | paid | failed"
        bigint amount_kopecks "сумма заказа, CHECK > 0"
        bigint paid_amount_kopecks "? из вебхука"
        char charged_currency "3, default RUB"
        bigint charged_amount_minor "?"
        varchar provider UK "32, UK(provider, provider_payment_id)"
        varchar method "32, ?"
        varchar provider_payment_id UK "128, ?"
        varchar donor_name "120, ? публичная подпись"
        boolean is_anonymous "default true"
        varchar region_source "16, ? link | form | admin"
        uuid recurring_id "? резерв под автоплатёж"
        timestamptz created_at
        timestamptz updated_at
        timestamptz paid_at "?"
    }

    donation_contact {
        uuid donation_id PK, FK "1:1 с donation"
        varchar phone_e164 "16, ? CHECK E.164"
        varchar full_name "120, ?"
        timestamptz personal_data_consent_at "NOT NULL"
        inet consent_ip "?"
        timestamptz created_at
    }

    payment_event {
        uuid id PK
        uuid donation_id FK "? пусто для неизвестного счёта"
        varchar provider UK "32, UK(provider, provider_event_id)"
        varchar provider_event_id UK "128, ключ идемпотентности"
        donation_status status
        bigint amount_kopecks "?"
        jsonb payload "сырое тело, email скрыт"
        timestamptz received_at
        timestamptz applied_at "? пусто = дубль/без эффекта"
    }

    gallery_item {
        uuid id PK
        uuid campaign_id FK
        varchar image_url "500"
        varchar alt_text "200, ?"
        varchar caption "300, ?"
        date taken_on "?"
        int width "?"
        int height "?"
        int sort_order "default 100"
        boolean is_published "default true"
        timestamptz created_at
        timestamptz updated_at
    }

    campaign ||--o| campaign_stats : "витрина (CASCADE)"
    campaign ||--o{ campaign_monthly_goal : "цели месяцев (CASCADE)"
    campaign ||--o{ donation : "собирает (RESTRICT)"
    campaign ||--o{ gallery_item : "фото стройки (CASCADE)"
    region |o--o{ region : "страна -> субъекты (RESTRICT)"
    region ||--o| region_stats : "витрина рейтинга (CASCADE)"
    region |o--o{ donation : "атрибуция (RESTRICT)"
    donation ||--o| donation_contact : "ПДн (CASCADE)"
    donation |o--o{ payment_event : "колбэки (RESTRICT)"
```

## Связи

| Связь | Кардинальность | FK | onDelete / onUpdate |
| --- | --- | --- | --- |
| campaign → campaign_stats | 1 : 0..1 (на деле 1:1 — строку создаёт триггер `campaign_stats_init_ai`) | `campaign_stats.campaign_id` | CASCADE / CASCADE |
| campaign → campaign_monthly_goal | 1 : N | `campaign_monthly_goal.campaign_id` | CASCADE / CASCADE |
| campaign → donation | 1 : N | `donation.campaign_id` | RESTRICT / CASCADE |
| campaign → gallery_item | 1 : N | `gallery_item.campaign_id` | CASCADE / CASCADE |
| region → region (иерархия) | 0..1 : N | `region.parent_id` | RESTRICT / CASCADE |
| region → region_stats | 1 : 0..1 (на деле 1:1 — триггер `region_stats_init_ai`) | `region_stats.region_id` | CASCADE / CASCADE |
| region → donation | 0..1 : N | `donation.region_id` (nullable) | RESTRICT / CASCADE |
| donation → donation_contact | 1 : 0..1 | `donation_contact.donation_id` | CASCADE / CASCADE |
| donation → payment_event | 0..1 : N | `payment_event.donation_id` (nullable) | RESTRICT / CASCADE |

N:M-связей нет.

## Enum-ы

| Тип в БД | Значения | Где |
| --- | --- | --- |
| `region_type` | `country`, `subject` | `region.type` |
| `donation_status` | `pending`, `paid`, `failed` | `donation.status`, `payment_event.status` |

«Мягкие» перечисления на `varchar` (без enum в БД): `donation.provider` (`manual`, `robokassa`,
`kaspi`, `mbank` — без CHECK), `donation.method` (`sbp`, `card`, … — без CHECK),
`donation.region_source` (`link`, `form`, `admin` — с CHECK).

## Логика вне Prisma (миграция `guards_and_stats`)

- **CHECK:** положительные суммы, формат валют/кодов стран/slug, иерархия региона
  (страна без родителя и кода, субъект — с ними), `paid` ⇔ заполнены `paid_at` и
  `paid_amount_kopecks`, анонимный донат без `donor_name`, `region_id` и `region_source`
  заполнены только вместе, телефон в E.164, `invoice_no > 0`.
- **EXCLUDE:** периоды `campaign_monthly_goal` одного сбора не пересекаются (`btree_gist`).
- **Частичный UNIQUE:** `region_one_row_per_country` — одна строка на страну.
- **Триггеры:** `donation_status_guard_bu/bd` (paid финален, в pending не возвращаемся,
  оплаченный донат не удаляется); `donation_stats_sync_aiu` (пересчёт `campaign_stats`,
  `region_stats`, `campaign_monthly_goal.collected_kopecks`); `campaign_stats_init_ai`,
  `region_stats_init_ai` (нулевые строки витрин).

Служебные поля: `created_at` / `updated_at` почти везде (`updated_at` двигает Prisma `@updatedAt`,
у витрин — триггер). Soft delete (`deleted_at`) не используется нигде.
