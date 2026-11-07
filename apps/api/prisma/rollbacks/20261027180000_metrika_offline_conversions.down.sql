-- Откат миграции 20261027180000_metrika_offline_conversions. Prisma down-миграции
-- не исполняет — файл для ручного запуска (psql), затем удалить строку миграции:
--   DELETE FROM "_prisma_migrations" WHERE migration_name = '20261027180000_metrika_offline_conversions';
-- Внимание: теряются ClientID/yclid донатов и история выгрузок в Метрику.
-- Деньги сбора, статусы и UTM-метки не затрагиваются.

BEGIN;

DROP TABLE IF EXISTS "metrika_offline_conversion";
DROP TYPE IF EXISTS "metrika_conversion_status";

ALTER TABLE "donation" DROP CONSTRAINT IF EXISTS "donation_yclid_format";
ALTER TABLE "donation" DROP CONSTRAINT IF EXISTS "donation_ym_client_id_format";
ALTER TABLE "donation" DROP COLUMN IF EXISTS "yclid";
ALTER TABLE "donation" DROP COLUMN IF EXISTS "ym_client_id";

COMMIT;
