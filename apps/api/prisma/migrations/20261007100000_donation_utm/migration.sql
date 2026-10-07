-- UTM-атрибуция доната (first-touch). Миграция аддитивная: только nullable-колонки
-- и индекс, существующие строки не трогаются.

-- AlterTable
ALTER TABLE "donation" ADD COLUMN     "landing_page" VARCHAR(512),
ADD COLUMN     "referrer" VARCHAR(512),
ADD COLUMN     "utm_campaign" VARCHAR(128),
ADD COLUMN     "utm_content" VARCHAR(128),
ADD COLUMN     "utm_medium" VARCHAR(128),
ADD COLUMN     "utm_source" VARCHAR(128),
ADD COLUMN     "utm_term" VARCHAR(128);

-- CreateIndex
CREATE INDEX "donation_status_utm_source_utm_campaign_idx" ON "donation"("status", "utm_source", "utm_campaign");

COMMENT ON COLUMN "donation"."utm_source"   IS 'utm_source первого захода (cookie на 30 дней)';
COMMENT ON COLUMN "donation"."referrer"     IS 'Внешний Referer первого захода';
COMMENT ON COLUMN "donation"."landing_page" IS 'Путь страницы первого захода, без домена';
