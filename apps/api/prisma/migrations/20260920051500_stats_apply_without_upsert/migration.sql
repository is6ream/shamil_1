-- Починка пересчёта витрин при правке уже оплаченного доната.
--
-- Что было не так. `donation_stats_apply` начисляла дельту через
-- `INSERT … ON CONFLICT DO UPDATE`. При снятии старого вклада (p_sign = -1)
-- предложенная к вставке строка содержит отрицательные суммы, а PostgreSQL
-- проверяет CHECK-ограничения на этой строке ещё до того, как обнаружит
-- конфликт и уйдёт в DO UPDATE. Срабатывало «campaign_stats_not_negative»,
-- и любая правка оплаченного доната падала: смена региона, исправление суммы,
-- повторный перевод в paid.
--
-- Как стало. Строка счётчиков создаётся отдельным INSERT с нулями (он CHECK
-- проходит), а дельта применяется обычным UPDATE.
--
-- Функция заменяется целиком через CREATE OR REPLACE: триггеры, которые её
-- вызывают, переопределять не нужно.

CREATE OR REPLACE FUNCTION "donation_stats_apply"(p_donation "donation", p_sign smallint)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_amount  bigint      := p_sign * p_donation."paid_amount_kopecks";
  v_count   integer     := p_sign;
  -- Время последнего поступления двигаем только при начислении.
  v_paid_at timestamptz := CASE WHEN p_sign > 0 THEN p_donation."paid_at" END;
BEGIN
  INSERT INTO "campaign_stats" ("campaign_id") VALUES (p_donation."campaign_id")
  ON CONFLICT ("campaign_id") DO NOTHING;

  UPDATE "campaign_stats"
     SET "paid_total_kopecks" = "paid_total_kopecks" + v_amount,
         "paid_count"         = "paid_count" + v_count,
         "last_paid_at"       = GREATEST("last_paid_at", v_paid_at),
         "updated_at"         = now()
   WHERE "campaign_id" = p_donation."campaign_id";

  IF p_donation."region_id" IS NOT NULL THEN
    INSERT INTO "region_stats" ("region_id") VALUES (p_donation."region_id")
    ON CONFLICT ("region_id") DO NOTHING;

    UPDATE "region_stats"
       SET "paid_total_kopecks" = "paid_total_kopecks" + v_amount,
           "paid_count"         = "paid_count" + v_count,
           "last_paid_at"       = GREATEST("last_paid_at", v_paid_at),
           "updated_at"         = now()
     WHERE "region_id" = p_donation."region_id";
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
