-- Удаление резерва под автоплатёж: donation.recurring_id и его индекса.
--
-- Решение заказчика 05.10.2026: пожертвования только разовые. Колонку
-- закладывали «чтобы потом не мигрировать боевую таблицу», но автоплатежа
-- не будет, а пустое поле с индексом только вводит в заблуждение.
--
-- Код колонку не писал ни разу, поэтому она должна быть пустой. Если это
-- не так, кто-то писал в неё в обход приложения — молча стирать такие данные
-- нельзя: миграция падает, и решение принимается вручную.
DO $$
DECLARE
  filled_count bigint;
BEGIN
  SELECT count(*) INTO filled_count FROM "donation" WHERE "recurring_id" IS NOT NULL;

  IF filled_count > 0 THEN
    RAISE EXCEPTION 'donation.recurring_id заполнена в % строках — удаление остановлено', filled_count;
  END IF;
END $$;

DROP INDEX "donation_recurring_id_idx";

-- COMMENT ON COLUMN из миграции guards_and_stats уходит вместе с колонкой.
ALTER TABLE "donation" DROP COLUMN "recurring_id";
