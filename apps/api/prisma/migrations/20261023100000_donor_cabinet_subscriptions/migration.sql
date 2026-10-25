-- Личный кабинет жертвователя и регулярные пожертвования (рекурренты Robokassa).
-- Аддитивно: новые таблицы и nullable-колонки. Существующие донаты получают
-- type = 'ONE_TIME' по умолчанию и не меняются ни в чём другом.
-- Отдельной таблицы платежей нет: первый платёж подписки и автосписания — это
-- те же donation, поэтому сумма сбора, рейтинг регионов и цель месяца считаются
-- прежним триггером donation_stats_sync без единой правки.

-- CreateEnum
CREATE TYPE "donation_type" AS ENUM ('ONE_TIME', 'PARENT', 'CHILD');

-- CreateEnum
CREATE TYPE "subscription_period" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY');

-- CreateEnum
CREATE TYPE "subscription_status" AS ENUM ('PENDING', 'ACTIVE', 'PAUSED', 'CANCELLED', 'FAILED');

-- AlterTable
ALTER TABLE "donation" ADD COLUMN     "subscription_id" UUID,
ADD COLUMN     "type" "donation_type" NOT NULL DEFAULT 'ONE_TIME',
ADD COLUMN     "user_id" UUID;

-- AlterTable
ALTER TABLE "donation_contact" ADD COLUMN     "email" VARCHAR(254);

-- CreateTable
CREATE TABLE "donor_user" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" VARCHAR(254) NOT NULL,
    "name" VARCHAR(120),
    "phone_e164" VARCHAR(16),
    "timezone" VARCHAR(64) NOT NULL DEFAULT 'Asia/Yekaterinburg',
    "marketing_consent" BOOLEAN NOT NULL DEFAULT false,
    "token_version" INTEGER NOT NULL DEFAULT 0,
    "last_login_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "donor_user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "donor_auth_code" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" VARCHAR(254) NOT NULL,
    "code_hash" CHAR(64) NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "used_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "donor_auth_code_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscription" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "campaign_id" UUID NOT NULL,
    "region_id" UUID,
    "amount_kopecks" BIGINT NOT NULL,
    "period" "subscription_period" NOT NULL,
    "charge_time" VARCHAR(5) NOT NULL,
    "status" "subscription_status" NOT NULL DEFAULT 'PENDING',
    "parent_invoice_no" INTEGER,
    "billing_anchor_date" DATE,
    "next_charge_at" TIMESTAMPTZ(3),
    "last_scheduled_at" TIMESTAMPTZ(3),
    "fail_count" INTEGER NOT NULL DEFAULT 0,
    "consent_accepted_at" TIMESTAMPTZ(3) NOT NULL,
    "consent_ip" INET,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cancelled_at" TIMESTAMPTZ(3),

    CONSTRAINT "subscription_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "donor_user_email_key" ON "donor_user"("email");

-- CreateIndex
CREATE INDEX "donor_auth_code_email_created_at_idx" ON "donor_auth_code"("email", "created_at" DESC);

-- CreateIndex
CREATE INDEX "subscription_status_next_charge_at_idx" ON "subscription"("status", "next_charge_at");

-- CreateIndex
CREATE INDEX "subscription_user_id_created_at_idx" ON "subscription"("user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "donation_user_id_created_at_idx" ON "donation"("user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "donation_subscription_id_status_idx" ON "donation"("subscription_id", "status");

-- CreateIndex
CREATE INDEX "donation_contact_email_idx" ON "donation_contact"("email");

-- AddForeignKey
ALTER TABLE "donation" ADD CONSTRAINT "donation_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "donor_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "donation" ADD CONSTRAINT "donation_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "subscription"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription" ADD CONSTRAINT "subscription_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "donor_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription" ADD CONSTRAINT "subscription_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription" ADD CONSTRAINT "subscription_region_id_fkey" FOREIGN KEY ("region_id") REFERENCES "region"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─── Ограничения, которых Prisma не выражает ────────────────────────────────

-- Разовый донат не принадлежит подписке; первый платёж и автосписание — всегда
-- её и всегда с владельцем: иначе автосписание некому показать в кабинете.
ALTER TABLE "donation"
  ADD CONSTRAINT "donation_type_subscription_consistency"
    CHECK (("type" = 'ONE_TIME') = ("subscription_id" IS NULL)),
  ADD CONSTRAINT "donation_subscription_has_user"
    CHECK ("type" = 'ONE_TIME' OR "user_id" IS NOT NULL);

-- Ровно один первый платёж на подписку.
CREATE UNIQUE INDEX "donation_one_parent_per_subscription"
  ON "donation"("subscription_id") WHERE "type" = 'PARENT';

-- Не больше одного висящего автосписания на подписку: второй pending CHILD
-- означал бы двойное списание с карты. Защита в базе, а не только в планировщике.
CREATE UNIQUE INDEX "donation_one_pending_child_per_subscription"
  ON "donation"("subscription_id") WHERE "type" = 'CHILD' AND "status" = 'pending';

ALTER TABLE "donation_contact"
  ADD CONSTRAINT "donation_contact_email_lowercase"
    CHECK ("email" IS NULL OR ("email" = lower("email") AND "email" LIKE '%_@_%'));

ALTER TABLE "donor_user"
  ADD CONSTRAINT "donor_user_email_lowercase"
    CHECK ("email" = lower("email") AND "email" LIKE '%_@_%'),
  ADD CONSTRAINT "donor_user_phone_e164"
    CHECK ("phone_e164" IS NULL OR "phone_e164" ~ '^\+[1-9][0-9]{7,14}$'),
  ADD CONSTRAINT "donor_user_token_version_non_negative" CHECK ("token_version" >= 0);

ALTER TABLE "donor_auth_code"
  ADD CONSTRAINT "donor_auth_code_email_lowercase" CHECK ("email" = lower("email")),
  ADD CONSTRAINT "donor_auth_code_attempts_non_negative" CHECK ("attempts" >= 0);

ALTER TABLE "subscription"
  ADD CONSTRAINT "subscription_amount_positive" CHECK ("amount_kopecks" > 0),
  ADD CONSTRAINT "subscription_charge_time_format"
    CHECK ("charge_time" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  ADD CONSTRAINT "subscription_fail_count_non_negative" CHECK ("fail_count" >= 0),
  -- Активная подписка без первого платежа списывать не с чего.
  ADD CONSTRAINT "subscription_active_has_parent"
    CHECK ("status" NOT IN ('ACTIVE', 'PAUSED', 'FAILED')
           OR ("parent_invoice_no" IS NOT NULL AND "billing_anchor_date" IS NOT NULL)),
  ADD CONSTRAINT "subscription_cancelled_at_consistency"
    CHECK (("status" = 'CANCELLED') = ("cancelled_at" IS NOT NULL));

COMMENT ON TABLE "donor_user"      IS 'Жертвователи с личным кабинетом; вход по коду на e-mail';
COMMENT ON TABLE "donor_auth_code" IS 'Одноразовые коды входа: только HMAC-SHA256, не сам код';
COMMENT ON TABLE "subscription"    IS 'Регулярные пожертвования; данных карты нет — только InvId первого платежа';
