-- Контент сайта: блоки главной, этапы стройки с фото, новости. Аддитивно:
-- новые таблицы и enum'ы, существующее не меняется.

-- CreateEnum
CREATE TYPE "construction_stage_status" AS ENUM ('done', 'current', 'upcoming');

-- CreateEnum
CREATE TYPE "news_status" AS ENUM ('draft', 'published');

-- CreateTable
CREATE TABLE "content_block" (
    "key" VARCHAR(32) NOT NULL,
    "data" JSONB NOT NULL,
    "updated_by_id" UUID,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "content_block_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "construction_stage" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "title" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "status" "construction_stage_status" NOT NULL DEFAULT 'upcoming',
    "budget_kopecks" BIGINT,
    "spent_kopecks" BIGINT,
    "sort_order" INTEGER NOT NULL DEFAULT 100,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "construction_stage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "construction_stage_photo" (
    "stage_id" UUID NOT NULL,
    "media_asset_id" UUID NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "construction_stage_photo_pkey" PRIMARY KEY ("stage_id","media_asset_id")
);

-- CreateTable
CREATE TABLE "news_post" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "slug" VARCHAR(120) NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "excerpt" VARCHAR(500),
    "body_markdown" TEXT NOT NULL,
    "cover_media_id" UUID,
    "status" "news_status" NOT NULL DEFAULT 'draft',
    "published_at" TIMESTAMPTZ(3),
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "news_post_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "construction_stage_sort_order_idx" ON "construction_stage"("sort_order");

-- CreateIndex
CREATE INDEX "construction_stage_photo_media_asset_id_idx" ON "construction_stage_photo"("media_asset_id");

-- CreateIndex
CREATE UNIQUE INDEX "news_post_slug_key" ON "news_post"("slug");

-- CreateIndex
CREATE INDEX "news_post_status_published_at_id_idx" ON "news_post"("status", "published_at" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "news_post_cover_media_id_idx" ON "news_post"("cover_media_id");

-- AddForeignKey
ALTER TABLE "construction_stage_photo" ADD CONSTRAINT "construction_stage_photo_stage_id_fkey" FOREIGN KEY ("stage_id") REFERENCES "construction_stage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "construction_stage_photo" ADD CONSTRAINT "construction_stage_photo_media_asset_id_fkey" FOREIGN KEY ("media_asset_id") REFERENCES "media_asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "news_post" ADD CONSTRAINT "news_post_cover_media_id_fkey" FOREIGN KEY ("cover_media_id") REFERENCES "media_asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Только известные блоки: хадисам и юридическим текстам здесь не место (D-10).
ALTER TABLE "content_block"
  ADD CONSTRAINT "content_block_key_allowed"
    CHECK ("key" IN ('hero', 'about', 'requisites', 'contacts', 'faq')),
  ADD CONSTRAINT "content_block_data_object" CHECK (jsonb_typeof("data") = 'object');

-- Деньги этапа — неотрицательные копейки.
ALTER TABLE "construction_stage"
  ADD CONSTRAINT "construction_stage_budget_not_negative"
    CHECK ("budget_kopecks" IS NULL OR "budget_kopecks" >= 0),
  ADD CONSTRAINT "construction_stage_spent_not_negative"
    CHECK ("spent_kopecks" IS NULL OR "spent_kopecks" >= 0);

-- Опубликованная новость обязана нести дату публикации, черновик — нет.
ALTER TABLE "news_post"
  ADD CONSTRAINT "news_post_slug_format" CHECK ("slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  ADD CONSTRAINT "news_post_published_at_consistency"
    CHECK (("status" = 'published') = ("published_at" IS NOT NULL));

COMMENT ON TABLE "content_block"            IS 'Тексты главной из админки: hero, about, requisites, contacts, faq. Хадисов и юр. текстов нет (D-10)';
COMMENT ON TABLE "construction_stage"       IS 'Этапы стройки: смета и освоено в копейках';
COMMENT ON TABLE "construction_stage_photo" IS 'Фото этапа из медиатеки';
COMMENT ON TABLE "news_post"                IS 'Новости и отчёты: markdown без HTML';
