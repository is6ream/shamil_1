-- Яндекс Метрика: идентификаторы визита в донате и outbox офлайн-конверсий.
-- Аддитивно: две nullable-колонки в donation и новая таблица. Существующие
-- донаты не меняются. Откат — prisma/rollbacks/20261027180000_metrika_offline_conversions.down.sql.

-- AlterTable
ALTER TABLE "donation" ADD COLUMN "ym_client_id" VARCHAR(32),
ADD COLUMN "yclid" VARCHAR(64);

-- Только цифры: значения уходят в CSV для Метрики, и формат держит сама база,
-- а не только DTO — писать в donation могут три пути.
ALTER TABLE "donation" ADD CONSTRAINT "donation_ym_client_id_format"
  CHECK ("ym_client_id" IS NULL OR "ym_client_id" ~ '^[0-9]{1,32}$');
ALTER TABLE "donation" ADD CONSTRAINT "donation_yclid_format"
  CHECK ("yclid" IS NULL OR "yclid" ~ '^[0-9]{1,64}$');

-- CreateEnum
CREATE TYPE "metrika_conversion_status" AS ENUM ('PENDING', 'UPLOADING', 'UPLOADED', 'PROCESSED', 'FAILED', 'SKIPPED');

-- CreateTable
CREATE TABLE "metrika_offline_conversion" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "donation_id" UUID NOT NULL,
    "target" VARCHAR(64) NOT NULL,
    "client_id" VARCHAR(32),
    "yclid" VARCHAR(64),
    "amount_kopecks" BIGINT NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'RUB',
    "conversion_at" TIMESTAMPTZ(3) NOT NULL,
    "status" "metrika_conversion_status" NOT NULL DEFAULT 'PENDING',
    "skip_reason" VARCHAR(32),
    "uploading_id" BIGINT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" VARCHAR(500),
    "locked_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "metrika_offline_conversion_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "metrika_offline_conversion_amount_positive" CHECK ("amount_kopecks" > 0),
    CONSTRAINT "metrika_offline_conversion_attempts_non_negative" CHECK ("attempts" >= 0),
    -- Строка к выгрузке обязана нести идентификатор визита: без него Метрике
    -- не с чем сопоставить конверсию, и такая строка — SKIPPED.
    CONSTRAINT "metrika_offline_conversion_identifier" CHECK (
      "status" = 'SKIPPED' OR "client_id" IS NOT NULL OR "yclid" IS NOT NULL
    ),
    CONSTRAINT "metrika_offline_conversion_skip_reason" CHECK (
      ("status" = 'SKIPPED') = ("skip_reason" IS NOT NULL)
    )
);

-- CreateIndex
CREATE UNIQUE INDEX "metrika_offline_conversion_donation_id_key" ON "metrika_offline_conversion"("donation_id");

-- CreateIndex
CREATE INDEX "metrika_offline_conversion_status_created_at_idx" ON "metrika_offline_conversion"("status", "created_at");

-- CreateIndex
CREATE INDEX "metrika_offline_conversion_uploading_id_idx" ON "metrika_offline_conversion"("uploading_id");

-- AddForeignKey
ALTER TABLE "metrika_offline_conversion" ADD CONSTRAINT "metrika_offline_conversion_donation_id_fkey" FOREIGN KEY ("donation_id") REFERENCES "donation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

COMMENT ON COLUMN "donation"."ym_client_id" IS 'ClientID Яндекс Метрики на момент создания доната';
COMMENT ON COLUMN "donation"."yclid"        IS 'Метка клика Яндекс Директа (cookie на 21 день)';
COMMENT ON TABLE  "metrika_offline_conversion" IS 'Outbox офлайн-конверсий donation_paid в Яндекс Метрику';
