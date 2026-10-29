-- Минимальное пожертвование снижено со 100 ₽ до 10 ₽.
-- Минимум проверяется по campaign.min_donation_kopecks, поэтому меняем и
-- значение по умолчанию, и уже существующие сборы — но только те, где стоял
-- прежний дефолт (10000). Если минимум сбора меняли вручную, не трогаем.

-- AlterTable
ALTER TABLE "campaign" ALTER COLUMN "min_donation_kopecks" SET DEFAULT 1000;

-- Data
UPDATE "campaign" SET "min_donation_kopecks" = 1000 WHERE "min_donation_kopecks" = 10000;
