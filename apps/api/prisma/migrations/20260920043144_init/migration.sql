-- CreateEnum
CREATE TYPE "region_type" AS ENUM ('country', 'subject');

-- CreateEnum
CREATE TYPE "donation_status" AS ENUM ('pending', 'paid', 'failed');

-- CreateTable
CREATE TABLE "campaign" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "slug" VARCHAR(64) NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "goal_kopecks" BIGINT NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'RUB',
    "min_donation_kopecks" BIGINT NOT NULL DEFAULT 10000,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "campaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaign_stats" (
    "campaign_id" UUID NOT NULL,
    "paid_total_kopecks" BIGINT NOT NULL DEFAULT 0,
    "paid_count" INTEGER NOT NULL DEFAULT 0,
    "last_paid_at" TIMESTAMPTZ(3),
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "campaign_stats_pkey" PRIMARY KEY ("campaign_id")
);

-- CreateTable
CREATE TABLE "campaign_monthly_goal" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "campaign_id" UUID NOT NULL,
    "period_start" DATE NOT NULL,
    "period_end" DATE NOT NULL,
    "goal_kopecks" BIGINT NOT NULL,
    "collected_kopecks" BIGINT NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "campaign_monthly_goal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "region" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "type" "region_type" NOT NULL,
    "parent_id" UUID,
    "country_code" CHAR(2) NOT NULL,
    "code" VARCHAR(8),
    "slug" VARCHAR(32) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "flag_url" VARCHAR(500),
    "sort_order" INTEGER NOT NULL DEFAULT 100,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_ranked" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "region_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "region_stats" (
    "region_id" UUID NOT NULL,
    "paid_total_kopecks" BIGINT NOT NULL DEFAULT 0,
    "paid_count" INTEGER NOT NULL DEFAULT 0,
    "last_paid_at" TIMESTAMPTZ(3),
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "region_stats_pkey" PRIMARY KEY ("region_id")
);

-- CreateTable
CREATE TABLE "donation" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "campaign_id" UUID NOT NULL,
    "region_id" UUID,
    "status" "donation_status" NOT NULL DEFAULT 'pending',
    "amount_kopecks" BIGINT NOT NULL,
    "paid_amount_kopecks" BIGINT,
    "charged_currency" CHAR(3) NOT NULL DEFAULT 'RUB',
    "charged_amount_minor" BIGINT,
    "provider" VARCHAR(32) NOT NULL DEFAULT 'manual',
    "method" VARCHAR(32),
    "provider_payment_id" VARCHAR(128),
    "donor_name" VARCHAR(120),
    "is_anonymous" BOOLEAN NOT NULL DEFAULT true,
    "region_source" VARCHAR(16),
    "recurring_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paid_at" TIMESTAMPTZ(3),

    CONSTRAINT "donation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "donation_contact" (
    "donation_id" UUID NOT NULL,
    "phone_e164" VARCHAR(16),
    "full_name" VARCHAR(120),
    "personal_data_consent_at" TIMESTAMPTZ(3) NOT NULL,
    "consent_ip" INET,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "donation_contact_pkey" PRIMARY KEY ("donation_id")
);

-- CreateTable
CREATE TABLE "payment_event" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "donation_id" UUID,
    "provider" VARCHAR(32) NOT NULL,
    "provider_event_id" VARCHAR(128) NOT NULL,
    "status" "donation_status" NOT NULL,
    "amount_kopecks" BIGINT,
    "payload" JSONB NOT NULL,
    "received_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "applied_at" TIMESTAMPTZ(3),

    CONSTRAINT "payment_event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gallery_item" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "campaign_id" UUID NOT NULL,
    "image_url" VARCHAR(500) NOT NULL,
    "alt_text" VARCHAR(200),
    "caption" VARCHAR(300),
    "taken_on" DATE,
    "width" INTEGER,
    "height" INTEGER,
    "sort_order" INTEGER NOT NULL DEFAULT 100,
    "is_published" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gallery_item_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "campaign_slug_key" ON "campaign"("slug");

-- CreateIndex
CREATE INDEX "campaign_monthly_goal_campaign_id_period_start_period_end_idx" ON "campaign_monthly_goal"("campaign_id", "period_start", "period_end");

-- CreateIndex
CREATE UNIQUE INDEX "campaign_monthly_goal_campaign_id_period_start_key" ON "campaign_monthly_goal"("campaign_id", "period_start");

-- CreateIndex
CREATE UNIQUE INDEX "region_slug_key" ON "region"("slug");

-- CreateIndex
CREATE INDEX "region_type_sort_order_name_idx" ON "region"("type", "sort_order", "name");

-- CreateIndex
CREATE INDEX "region_parent_id_idx" ON "region"("parent_id");

-- CreateIndex
CREATE UNIQUE INDEX "region_country_code_code_key" ON "region"("country_code", "code");

-- CreateIndex
CREATE INDEX "region_stats_paid_total_kopecks_idx" ON "region_stats"("paid_total_kopecks" DESC);

-- CreateIndex
CREATE INDEX "donation_status_paid_at_id_idx" ON "donation"("status", "paid_at" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "donation_campaign_id_status_idx" ON "donation"("campaign_id", "status");

-- CreateIndex
CREATE INDEX "donation_region_id_status_idx" ON "donation"("region_id", "status");

-- CreateIndex
CREATE INDEX "donation_status_is_anonymous_paid_amount_kopecks_idx" ON "donation"("status", "is_anonymous", "paid_amount_kopecks" DESC);

-- CreateIndex
CREATE INDEX "donation_recurring_id_idx" ON "donation"("recurring_id");

-- CreateIndex
CREATE UNIQUE INDEX "donation_provider_provider_payment_id_key" ON "donation"("provider", "provider_payment_id");

-- CreateIndex
CREATE INDEX "payment_event_donation_id_received_at_idx" ON "payment_event"("donation_id", "received_at");

-- CreateIndex
CREATE UNIQUE INDEX "payment_event_provider_provider_event_id_key" ON "payment_event"("provider", "provider_event_id");

-- CreateIndex
CREATE INDEX "gallery_item_campaign_id_is_published_sort_order_taken_on_idx" ON "gallery_item"("campaign_id", "is_published", "sort_order", "taken_on");

-- AddForeignKey
ALTER TABLE "campaign_stats" ADD CONSTRAINT "campaign_stats_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_monthly_goal" ADD CONSTRAINT "campaign_monthly_goal_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "region" ADD CONSTRAINT "region_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "region"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "region_stats" ADD CONSTRAINT "region_stats_region_id_fkey" FOREIGN KEY ("region_id") REFERENCES "region"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "donation" ADD CONSTRAINT "donation_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "donation" ADD CONSTRAINT "donation_region_id_fkey" FOREIGN KEY ("region_id") REFERENCES "region"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "donation_contact" ADD CONSTRAINT "donation_contact_donation_id_fkey" FOREIGN KEY ("donation_id") REFERENCES "donation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_event" ADD CONSTRAINT "payment_event_donation_id_fkey" FOREIGN KEY ("donation_id") REFERENCES "donation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gallery_item" ADD CONSTRAINT "gallery_item_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
