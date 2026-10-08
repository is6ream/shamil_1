-- Медиатека и видео-ссылки. Аддитивно: две новые таблицы и nullable-колонка
-- в gallery_item. Существующие строки галереи не меняются.

-- CreateTable
CREATE TABLE "media_asset" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "storage_key" VARCHAR(200) NOT NULL,
    "variants" JSONB NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "bytes" INTEGER NOT NULL,
    "original_name" VARCHAR(200),
    "alt_text" VARCHAR(300),
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "media_asset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "video_link" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "provider" VARCHAR(16) NOT NULL,
    "source_url" VARCHAR(500) NOT NULL,
    "embed_url" VARCHAR(500) NOT NULL,
    "title" VARCHAR(200),
    "poster_media_id" UUID,
    "sort_order" INTEGER NOT NULL DEFAULT 100,
    "is_published" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "video_link_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "gallery_item" ADD COLUMN "media_asset_id" UUID;

-- CreateIndex
CREATE UNIQUE INDEX "media_asset_storage_key_key" ON "media_asset"("storage_key");

-- CreateIndex
CREATE INDEX "media_asset_created_at_id_idx" ON "media_asset"("created_at" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "video_link_is_published_sort_order_idx" ON "video_link"("is_published", "sort_order");

-- CreateIndex
CREATE INDEX "video_link_poster_media_id_idx" ON "video_link"("poster_media_id");

-- CreateIndex
CREATE INDEX "gallery_item_media_asset_id_idx" ON "gallery_item"("media_asset_id");

-- AddForeignKey
ALTER TABLE "gallery_item" ADD CONSTRAINT "gallery_item_media_asset_id_fkey" FOREIGN KEY ("media_asset_id") REFERENCES "media_asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "video_link" ADD CONSTRAINT "video_link_poster_media_id_fkey" FOREIGN KEY ("poster_media_id") REFERENCES "media_asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Ключ хранилища генерирует сервер: только «ГГГГ/ММ/uuid». Ни пользовательского
-- имени файла, ни «../» сюда попасть не может даже при ошибке в коде.
ALTER TABLE "media_asset"
  ADD CONSTRAINT "media_asset_storage_key_format"
    CHECK ("storage_key" ~ '^[0-9]{4}/[0-9]{2}/[0-9a-f-]{36}$'),
  ADD CONSTRAINT "media_asset_dimensions_positive"
    CHECK ("width" > 0 AND "height" > 0 AND "bytes" > 0);

-- Только площадки из allowlist (D-13) и только https.
ALTER TABLE "video_link"
  ADD CONSTRAINT "video_link_provider_allowed" CHECK ("provider" IN ('vk', 'rutube', 'youtube')),
  ADD CONSTRAINT "video_link_urls_https"
    CHECK ("source_url" LIKE 'https://%' AND "embed_url" LIKE 'https://%');

COMMENT ON TABLE "media_asset" IS 'Медиатека: WebP трёх размеров без EXIF; имя файла генерирует сервер';
COMMENT ON TABLE "video_link"  IS 'Видео со стройки: ссылки VK Видео / Rutube / YouTube, embed строит сервер';
