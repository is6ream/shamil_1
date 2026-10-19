-- Атрибуция last-touch, время первого захода, «откуда узнали» и короткие ссылки.
-- Аддитивно: nullable-колонки в donation и новая таблица. Существующие донаты
-- не меняются: их utm_* остаются first-touch как есть, без приведения регистра.

-- AlterTable
ALTER TABLE "donation" ADD COLUMN     "first_touch_at" TIMESTAMPTZ(3),
ADD COLUMN     "how_did_you_hear" VARCHAR(32),
ADD COLUMN     "last_utm_campaign" VARCHAR(128),
ADD COLUMN     "last_utm_content" VARCHAR(128),
ADD COLUMN     "last_utm_medium" VARCHAR(128),
ADD COLUMN     "last_utm_source" VARCHAR(128),
ADD COLUMN     "last_utm_term" VARCHAR(128);

-- Список значений живёт в DTO (как у provider); база держит только формат,
-- чтобы в колонку не попал произвольный текст из обхода валидации.
ALTER TABLE "donation" ADD CONSTRAINT "donation_how_did_you_hear_format"
  CHECK ("how_did_you_hear" IS NULL OR "how_did_you_hear" ~ '^[a-z][a-z_]*$');

-- CreateTable
CREATE TABLE "short_link" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "slug" VARCHAR(64) NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "target_path" VARCHAR(256) NOT NULL DEFAULT '/',
    "utm_source" VARCHAR(128) NOT NULL,
    "utm_medium" VARCHAR(128),
    "utm_campaign" VARCHAR(128),
    "utm_content" VARCHAR(128),
    "utm_term" VARCHAR(128),
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "short_link_pkey" PRIMARY KEY ("id"),
    -- Слаг диктуют голосом и печатают в QR: только строчные латиница, цифры, дефис.
    CONSTRAINT "short_link_slug_format"
      CHECK ("slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
    CONSTRAINT "short_link_title_not_blank"
      CHECK (length(btrim("title")) > 0),
    -- Только путь своего сайта: начинается с одного "/", без "//", "\", query
    -- и фрагмента. "//evil.example" браузер понял бы как чужой домен.
    CONSTRAINT "short_link_target_path_format"
      CHECK ("target_path" ~ '^/([A-Za-z0-9._~-]+/)*[A-Za-z0-9._~-]*$'),
    -- Метки ссылки хранятся нормализованными — так же, как их пишет донат:
    -- иначе "Telegram" и "telegram" разъедутся по строкам отчёта.
    CONSTRAINT "short_link_utm_normalized" CHECK (
      "utm_source" = lower(btrim("utm_source")) AND length("utm_source") > 0
      AND ("utm_medium"   IS NULL OR "utm_medium"   = lower(btrim("utm_medium")))
      AND ("utm_campaign" IS NULL OR "utm_campaign" = lower(btrim("utm_campaign")))
      AND ("utm_content"  IS NULL OR "utm_content"  = lower(btrim("utm_content")))
      AND ("utm_term"     IS NULL OR "utm_term"     = lower(btrim("utm_term")))
    ),
    CONSTRAINT "short_link_clicks_non_negative" CHECK ("clicks" >= 0)
);

-- CreateIndex
CREATE UNIQUE INDEX "short_link_slug_key" ON "short_link"("slug");

-- CreateIndex
CREATE INDEX "short_link_created_at_id_idx" ON "short_link"("created_at" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "donation_status_paid_at_last_utm_source_idx" ON "donation"("status", "paid_at", "last_utm_source");

COMMENT ON COLUMN "donation"."first_touch_at"   IS 'Время первого захода из cookie first-touch';
COMMENT ON COLUMN "donation"."last_utm_source"  IS 'utm_source последнего захода с метками (cookie на 90 дней)';
COMMENT ON COLUMN "donation"."how_did_you_hear" IS 'Откуда узнали о сборе — вкладка перевода по реквизитам';
COMMENT ON COLUMN "donation"."utm_source"       IS 'utm_source первого захода, либо источник по Referer, если меток не было';
COMMENT ON TABLE  "short_link"                  IS 'Короткие ссылки /go/<slug> для QR и соцсетей';
