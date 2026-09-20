-- Инварианты, которые Prisma выразить не умеет: CHECK-ограничения, запрет
-- обратного перехода статуса, пересчёт витринных счётчиков, непересекающиеся
-- периоды цели месяца.
--
-- Это не «дополнение к схеме», а её несущая часть: на этих объектах держатся
-- сумма сбора и рейтинг регионов. При генерации новых миграций Prisma их не
-- видит — проверяйте, что очередная миграция ничего здесь не удаляет.
-- Наличие объектов проверяет тест src/database/schema-guards.spec.ts.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Деньги, валюты, форматы
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE "campaign"
  ADD CONSTRAINT "campaign_goal_positive" CHECK ("goal_kopecks" > 0),
  ADD CONSTRAINT "campaign_min_donation_positive" CHECK ("min_donation_kopecks" > 0),
  ADD CONSTRAINT "campaign_currency_format" CHECK ("currency" ~ '^[A-Z]{3}$');

ALTER TABLE "campaign_stats"
  ADD CONSTRAINT "campaign_stats_not_negative"
  CHECK ("paid_total_kopecks" >= 0 AND "paid_count" >= 0);

ALTER TABLE "region_stats"
  ADD CONSTRAINT "region_stats_not_negative"
  CHECK ("paid_total_kopecks" >= 0 AND "paid_count" >= 0);

ALTER TABLE "gallery_item"
  ADD CONSTRAINT "gallery_item_dimensions_positive"
  CHECK (("width" IS NULL OR "width" > 0) AND ("height" IS NULL OR "height" > 0));

ALTER TABLE "payment_event"
  ADD CONSTRAINT "payment_event_amount_positive"
  CHECK ("amount_kopecks" IS NULL OR "amount_kopecks" > 0);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Цель на месяц: периоды одного сбора не пересекаются
--    Иначе донат попадёт в две шкалы сразу, и «собрано за месяц» разойдётся
--    с реальностью. btree_gist нужен для сравнения uuid внутри EXCLUDE.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "campaign_monthly_goal"
  ADD CONSTRAINT "campaign_monthly_goal_period_order" CHECK ("period_end" >= "period_start"),
  ADD CONSTRAINT "campaign_monthly_goal_goal_positive" CHECK ("goal_kopecks" > 0),
  ADD CONSTRAINT "campaign_monthly_goal_collected_not_negative" CHECK ("collected_kopecks" >= 0),
  ADD CONSTRAINT "campaign_monthly_goal_no_overlap" EXCLUDE USING gist (
    "campaign_id" WITH =,
    daterange("period_start", "period_end", '[]') WITH &&
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Справочник регионов: страна — корень, субъект — лист с официальным кодом
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE "region"
  ADD CONSTRAINT "region_country_code_format" CHECK ("country_code" ~ '^[A-Z]{2}$'),
  ADD CONSTRAINT "region_slug_format" CHECK ("slug" ~ '^[a-z0-9-]+$'),
  ADD CONSTRAINT "region_hierarchy" CHECK (
    ("type" = 'country' AND "parent_id" IS NULL AND "code" IS NULL)
    OR ("type" = 'subject' AND "parent_id" IS NOT NULL AND "code" IS NOT NULL)
  );

-- Одна страна — одна строка: уникальность (country_code, code) для стран
-- не работает, там code пуст, а NULL в PostgreSQL не конфликтует сам с собой.
CREATE UNIQUE INDEX "region_one_row_per_country"
  ON "region" ("country_code")
  WHERE "type" = 'country';

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Донат: что обязано быть заполнено в каждом статусе
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE "donation"
  ADD CONSTRAINT "donation_amount_positive" CHECK ("amount_kopecks" > 0),
  ADD CONSTRAINT "donation_paid_amount_positive"
    CHECK ("paid_amount_kopecks" IS NULL OR "paid_amount_kopecks" > 0),
  ADD CONSTRAINT "donation_charged_currency_format" CHECK ("charged_currency" ~ '^[A-Z]{3}$'),
  ADD CONSTRAINT "donation_charged_amount_positive"
    CHECK ("charged_amount_minor" IS NULL OR "charged_amount_minor" > 0),
  -- paid обязан нести время и фактическую сумму: по ним считаются витрины.
  -- В остальных статусах денег нет, и следов оплаты быть не должно.
  ADD CONSTRAINT "donation_paid_fields" CHECK (
    CASE "status"
      WHEN 'paid' THEN "paid_at" IS NOT NULL AND "paid_amount_kopecks" IS NOT NULL
      ELSE "paid_at" IS NULL AND "paid_amount_kopecks" IS NULL
    END
  ),
  -- Анонимный донат не хранит публичную подпись вообще.
  ADD CONSTRAINT "donation_anonymous_has_no_public_name"
    CHECK (NOT "is_anonymous" OR "donor_name" IS NULL),
  ADD CONSTRAINT "donation_region_source_allowed"
    CHECK ("region_source" IS NULL OR "region_source" IN ('link', 'form', 'admin')),
  -- Регион без источника атрибуции — потеря той самой статистики, на которой
  -- референс потерял 93% донатов. Одно без другого не записывается.
  ADD CONSTRAINT "donation_region_source_consistency"
    CHECK (("region_id" IS NULL) = ("region_source" IS NULL));

ALTER TABLE "donation_contact"
  ADD CONSTRAINT "donation_contact_phone_e164"
  CHECK ("phone_e164" IS NULL OR "phone_e164" ~ '^\+[1-9][0-9]{7,14}$');

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. pending → paid, и никогда обратно
--    Вебхуки агрегаторов приходят по нескольку раз и в произвольном порядке:
--    отказной колбэк вполне может доставиться после успешного. Запрет живёт
--    в БД, а не в сервисе, потому что писать в donation будут три пути —
--    вебхук, админский ручной донат и сиды.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION "donation_status_guard"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD."status" = 'paid' THEN
      RAISE EXCEPTION
        'DONATION_PAID_DELETE_FORBIDDEN: оплаченный донат % удалять нельзя — по нему посчитаны сумма сбора и рейтинг региона',
        OLD."id" USING ERRCODE = 'ZS002';
    END IF;

    RETURN OLD;
  END IF;

  IF OLD."status" = NEW."status" THEN
    RETURN NEW;
  END IF;

  IF OLD."status" = 'paid' THEN
    RAISE EXCEPTION
      'DONATION_PAID_IS_FINAL: донат % оплачен, статус на "%" уже не меняется',
      OLD."id", NEW."status" USING ERRCODE = 'ZS001';
  END IF;

  IF NEW."status" = 'pending' THEN
    RAISE EXCEPTION
      'DONATION_NO_RETURN_TO_PENDING: донат % нельзя вернуть в pending из "%"',
      OLD."id", OLD."status" USING ERRCODE = 'ZS001';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "donation_status_guard_bu"
  BEFORE UPDATE OF "status" ON "donation"
  FOR EACH ROW EXECUTE FUNCTION "donation_status_guard"();

CREATE TRIGGER "donation_status_guard_bd"
  BEFORE DELETE ON "donation"
  FOR EACH ROW EXECUTE FUNCTION "donation_status_guard"();

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Витринные счётчики
--    Сумма сбора, счётчик региона и «собрано за месяц» пересчитываются здесь,
--    а не запросом SUM() по донатам: главная страница читает три строки,
--    а не сканирует таблицу платежей.
--    Триггер, а не сервис, — потому что путей записи несколько, и забыть
--    вызвать пересчёт в одном из них означает разойтись в деньгах.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION "donation_stats_apply"(p_donation "donation", p_sign smallint)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_amount  bigint      := p_sign * p_donation."paid_amount_kopecks";
  v_count   integer     := p_sign;
  -- Время последнего поступления двигаем только при начислении.
  v_paid_at timestamptz := CASE WHEN p_sign > 0 THEN p_donation."paid_at" END;
BEGIN
  INSERT INTO "campaign_stats" AS cs
    ("campaign_id", "paid_total_kopecks", "paid_count", "last_paid_at", "updated_at")
  VALUES (p_donation."campaign_id", v_amount, v_count, v_paid_at, now())
  ON CONFLICT ("campaign_id") DO UPDATE SET
    "paid_total_kopecks" = cs."paid_total_kopecks" + EXCLUDED."paid_total_kopecks",
    "paid_count"         = cs."paid_count" + EXCLUDED."paid_count",
    "last_paid_at"       = GREATEST(cs."last_paid_at", EXCLUDED."last_paid_at"),
    "updated_at"         = now();

  IF p_donation."region_id" IS NOT NULL THEN
    INSERT INTO "region_stats" AS rs
      ("region_id", "paid_total_kopecks", "paid_count", "last_paid_at", "updated_at")
    VALUES (p_donation."region_id", v_amount, v_count, v_paid_at, now())
    ON CONFLICT ("region_id") DO UPDATE SET
      "paid_total_kopecks" = rs."paid_total_kopecks" + EXCLUDED."paid_total_kopecks",
      "paid_count"         = rs."paid_count" + EXCLUDED."paid_count",
      "last_paid_at"       = GREATEST(rs."last_paid_at", EXCLUDED."last_paid_at"),
      "updated_at"         = now();
  END IF;

  -- Месяц определяется по московскому времени, а не по таймзоне сервера:
  -- иначе донат в 23:30 31-го числа попадёт в другой месяц на другой машине.
  UPDATE "campaign_monthly_goal"
     SET "collected_kopecks" = "collected_kopecks" + v_amount,
         "updated_at" = now()
   WHERE "campaign_id" = p_donation."campaign_id"
     AND (p_donation."paid_at" AT TIME ZONE 'Europe/Moscow')::date
           BETWEEN "period_start" AND "period_end";
END;
$$;

CREATE OR REPLACE FUNCTION "donation_stats_sync"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Ручной донат из админки и сид вставляются сразу оплаченными.
    IF NEW."status" = 'paid' THEN
      PERFORM "donation_stats_apply"(NEW, 1::smallint);
    END IF;

    RETURN NULL;
  END IF;

  IF OLD."status" = 'paid' AND NEW."status" = 'paid' THEN
    -- Правка оплаченного доната: сменили регион, поправили сумму, сдвинули дату.
    -- Снимаем старый вклад целиком и начисляем новый — так не нужно
    -- разбирать, что именно изменилось.
    PERFORM "donation_stats_apply"(OLD, -1::smallint);
    PERFORM "donation_stats_apply"(NEW, 1::smallint);
  ELSIF NEW."status" = 'paid' THEN
    PERFORM "donation_stats_apply"(NEW, 1::smallint);
  END IF;

  RETURN NULL;
END;
$$;

CREATE TRIGGER "donation_stats_sync_aiu"
  AFTER INSERT OR UPDATE OF "status", "campaign_id", "region_id", "paid_amount_kopecks", "paid_at"
  ON "donation"
  FOR EACH ROW EXECUTE FUNCTION "donation_stats_sync"();

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. У каждого сбора и каждого региона строка счётчиков есть сразу, с нулями.
--    Тогда «ещё N регионов ждут первого пожертвования» — обычный SELECT,
--    а пустой регион в рейтинге не требует внешнего соединения.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION "campaign_stats_init"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO "campaign_stats" ("campaign_id") VALUES (NEW."id")
  ON CONFLICT ("campaign_id") DO NOTHING;

  RETURN NULL;
END;
$$;

CREATE TRIGGER "campaign_stats_init_ai"
  AFTER INSERT ON "campaign"
  FOR EACH ROW EXECUTE FUNCTION "campaign_stats_init"();

CREATE OR REPLACE FUNCTION "region_stats_init"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO "region_stats" ("region_id") VALUES (NEW."id")
  ON CONFLICT ("region_id") DO NOTHING;

  RETURN NULL;
END;
$$;

CREATE TRIGGER "region_stats_init_ai"
  AFTER INSERT ON "region"
  FOR EACH ROW EXECUTE FUNCTION "region_stats_init"();

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. Подписи для того, кто откроет базу без исходников
-- ─────────────────────────────────────────────────────────────────────────────

COMMENT ON TABLE  "campaign"              IS 'Сбор: общая цель, валюта учёта, минимальный донат';
COMMENT ON TABLE  "campaign_stats"        IS 'Витрина сбора: собрано и число платежей, пересчёт триггером';
COMMENT ON TABLE  "campaign_monthly_goal" IS 'Цель на месяц с границами периода — верхняя шкала прогресс-бара';
COMMENT ON TABLE  "region"                IS 'Справочник «откуда вы»: страны и субъекты РФ в одном списке';
COMMENT ON TABLE  "region_stats"          IS 'Витрина рейтинга землячеств (блок 4 ТЗ)';
COMMENT ON TABLE  "donation"              IS 'Донат. pending → paid, paid финально; суммы в копейках';
COMMENT ON TABLE  "donation_contact"      IS 'ПДн донатера (152-ФЗ): телефон, имя, согласие. В публичные выборки не попадает';
COMMENT ON TABLE  "payment_event"         IS 'Колбэки провайдера; уникальный provider_event_id = идемпотентность';
COMMENT ON TABLE  "gallery_item"          IS 'Фотогалерея стройки, хронологически по taken_on';

COMMENT ON COLUMN "donation"."amount_kopecks"      IS 'Сумма заказа, сформированная сервером, в копейках';
COMMENT ON COLUMN "donation"."paid_amount_kopecks" IS 'Фактически оплаченная сумма из вебхука — только она идёт в витрины';
COMMENT ON COLUMN "donation"."region_id"           IS 'Nullable намеренно: донат без региона обязан проходить';
COMMENT ON COLUMN "donation"."recurring_id"        IS 'Место под автоплатёж: он за границами MVP';
COMMENT ON COLUMN "donation"."is_anonymous"        IS 'По умолчанию true: садака — скрытое поклонение (блок 9 ТЗ)';
COMMENT ON COLUMN "donation_contact"."phone_e164"  IS 'Только формат E.164; в публичные API и логи не выводится';
