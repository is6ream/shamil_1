-- Комментарий к ручному поступлению из админки. Аддитивно: nullable-колонка,
-- существующие донаты не меняются, триггеры витрин её не касаются.

ALTER TABLE "donation" ADD COLUMN "admin_comment" VARCHAR(500);

COMMENT ON COLUMN "donation"."admin_comment" IS 'Комментарий админа к ручному поступлению; без ПДн';
