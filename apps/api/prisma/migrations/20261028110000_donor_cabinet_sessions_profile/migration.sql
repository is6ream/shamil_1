-- Кабинет жертвователя, этап 1 (27.10.2026): сессии с ротацией вместо
-- token_version, вход через VK ID рядом с кодом на e-mail, профиль
-- (ФИО, регион, город, показ в ленте, согласие на ПДн), обезличивание
-- аккаунта и заявки на справку для налогового вычета.
--
-- Поверх черновой 20261023100000_donor_cabinet_subscriptions: та ещё не в
-- production, но уже накатана на локальные базы, поэтому правится не она,
-- а добавляется эта. В production обе уедут одним деплоем.

-- CreateEnum
CREATE TYPE "tax_certificate_status" AS ENUM ('NEW', 'IN_PROGRESS', 'DONE');

-- AlterTable
ALTER TABLE "donor_auth_code" ADD COLUMN     "donor_id" UUID,
ADD COLUMN     "ip" INET,
ADD COLUMN     "purpose" VARCHAR(16) NOT NULL DEFAULT 'login';

-- Имя переезжает в first_name до удаления колонки: фамилию из одной
-- строки «Ильдар Хасанов» надёжно не выделить, человек поправит сам.
ALTER TABLE "donor_user" ADD COLUMN "first_name" VARCHAR(60);
UPDATE "donor_user" SET "first_name" = left(btrim("name"), 60) WHERE "name" IS NOT NULL AND btrim("name") <> '';

-- Отзыв сессий теперь в donor_session: версия токенов больше не нужна.
ALTER TABLE "donor_user" DROP CONSTRAINT "donor_user_token_version_non_negative";

-- AlterTable
ALTER TABLE "donor_user" DROP COLUMN "name",
DROP COLUMN "token_version",
ADD COLUMN     "city" VARCHAR(120),
ADD COLUMN     "deleted_at" TIMESTAMPTZ(3),
ADD COLUMN     "last_name" VARCHAR(60),
ADD COLUMN     "middle_name" VARCHAR(60),
ADD COLUMN     "pd_consent_at" TIMESTAMPTZ(3),
ADD COLUMN     "pd_consent_version" VARCHAR(32),
ADD COLUMN     "region_id" UUID,
ADD COLUMN     "show_in_feed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "vk_user_id" VARCHAR(32),
ALTER COLUMN "email" DROP NOT NULL;

-- CreateTable
CREATE TABLE "donor_session" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "donor_id" UUID NOT NULL,
    "user_agent" VARCHAR(256),
    "ip" INET,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "revoked_at" TIMESTAMPTZ(3),
    "last_used_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "donor_session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "donor_refresh_token" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "session_id" UUID NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "used_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "donor_refresh_token_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "donor_oauth_state" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "state_hash" CHAR(64) NOT NULL,
    "code_verifier" VARCHAR(128) NOT NULL,
    "purpose" VARCHAR(8) NOT NULL,
    "donor_id" UUID,
    "return_to" VARCHAR(512) NOT NULL DEFAULT '/profile',
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "used_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "donor_oauth_state_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tax_certificate_request" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "donor_id" UUID NOT NULL,
    "year" SMALLINT NOT NULL,
    "status" "tax_certificate_status" NOT NULL DEFAULT 'NEW',
    "admin_comment" VARCHAR(500),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "done_at" TIMESTAMPTZ(3),

    CONSTRAINT "tax_certificate_request_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "donor_session_donor_id_idx" ON "donor_session"("donor_id");

-- CreateIndex
CREATE UNIQUE INDEX "donor_refresh_token_token_hash_key" ON "donor_refresh_token"("token_hash");

-- CreateIndex
CREATE INDEX "donor_refresh_token_session_id_idx" ON "donor_refresh_token"("session_id");

-- CreateIndex
CREATE UNIQUE INDEX "donor_oauth_state_state_hash_key" ON "donor_oauth_state"("state_hash");

-- CreateIndex
CREATE INDEX "donor_oauth_state_expires_at_idx" ON "donor_oauth_state"("expires_at");

-- CreateIndex
CREATE INDEX "tax_certificate_request_status_created_at_idx" ON "tax_certificate_request"("status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "tax_certificate_request_donor_id_year_key" ON "tax_certificate_request"("donor_id", "year");

-- CreateIndex
CREATE INDEX "donor_auth_code_ip_created_at_idx" ON "donor_auth_code"("ip", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "donor_user_vk_user_id_key" ON "donor_user"("vk_user_id");

-- AddForeignKey
ALTER TABLE "donor_user" ADD CONSTRAINT "donor_user_region_id_fkey" FOREIGN KEY ("region_id") REFERENCES "region"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "donor_auth_code" ADD CONSTRAINT "donor_auth_code_donor_id_fkey" FOREIGN KEY ("donor_id") REFERENCES "donor_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "donor_session" ADD CONSTRAINT "donor_session_donor_id_fkey" FOREIGN KEY ("donor_id") REFERENCES "donor_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "donor_refresh_token" ADD CONSTRAINT "donor_refresh_token_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "donor_session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "donor_oauth_state" ADD CONSTRAINT "donor_oauth_state_donor_id_fkey" FOREIGN KEY ("donor_id") REFERENCES "donor_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tax_certificate_request" ADD CONSTRAINT "tax_certificate_request_donor_id_fkey" FOREIGN KEY ("donor_id") REFERENCES "donor_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─── Ограничения, которых Prisma не выражает ────────────────────────────────

-- E-mail стал необязательным (вход через VK), правило регистра — прежнее.
ALTER TABLE "donor_user" DROP CONSTRAINT "donor_user_email_lowercase";

ALTER TABLE "donor_user"
  ADD CONSTRAINT "donor_user_email_lowercase"
    CHECK ("email" IS NULL OR ("email" = lower("email") AND "email" LIKE '%_@_%')),
  -- Живому аккаунту нужен способ войти: иначе он недостижим и только копит ПДн.
  ADD CONSTRAINT "donor_user_has_login"
    CHECK ("deleted_at" IS NOT NULL OR "email" IS NOT NULL OR "vk_user_id" IS NOT NULL),
  -- Обезличенный аккаунт не хранит ничего, что указывает на человека.
  -- Донаты остаются (бухгалтерский учёт), но без user_id — это делает сервис.
  ADD CONSTRAINT "donor_user_deleted_is_anonymous"
    CHECK ("deleted_at" IS NULL OR (
      "email" IS NULL AND "vk_user_id" IS NULL AND "phone_e164" IS NULL
      AND "first_name" IS NULL AND "last_name" IS NULL AND "middle_name" IS NULL
      AND "city" IS NULL AND "region_id" IS NULL AND NOT "show_in_feed"
    )),
  -- Согласие без версии текста не доказывает, на что согласились (152-ФЗ).
  ADD CONSTRAINT "donor_user_pd_consent_versioned"
    CHECK (("pd_consent_at" IS NULL) = ("pd_consent_version" IS NULL)),
  ADD CONSTRAINT "donor_user_vk_user_id_digits" CHECK ("vk_user_id" IS NULL OR "vk_user_id" ~ '^[0-9]{1,32}$');

ALTER TABLE "donor_auth_code"
  ADD CONSTRAINT "donor_auth_code_purpose"
    CHECK ("purpose" IN ('login', 'change_email', 'delete_account')),
  -- Код входа ничей (аккаунта может не быть), остальные — всегда конкретного человека.
  ADD CONSTRAINT "donor_auth_code_purpose_owner"
    CHECK (("purpose" = 'login') = ("donor_id" IS NULL));

ALTER TABLE "donor_oauth_state"
  ADD CONSTRAINT "donor_oauth_state_purpose" CHECK ("purpose" IN ('login', 'link')),
  ADD CONSTRAINT "donor_oauth_state_purpose_owner" CHECK (("purpose" = 'link') = ("donor_id" IS NOT NULL)),
  -- Только путь своего сайта: открытый редирект на чужой домен после входа —
  -- готовая фишинговая ссылка «войдите через VK».
  ADD CONSTRAINT "donor_oauth_state_return_to_relative"
    CHECK ("return_to" ~ '^/[^/\\]' OR "return_to" = '/');

ALTER TABLE "tax_certificate_request"
  ADD CONSTRAINT "tax_certificate_request_year_range" CHECK ("year" BETWEEN 2020 AND 2100),
  ADD CONSTRAINT "tax_certificate_request_done_at_consistency"
    CHECK (("status" = 'DONE') = ("done_at" IS NOT NULL));

COMMENT ON TABLE "donor_user"              IS 'Жертвователи с личным кабинетом; вход по коду на e-mail или через VK ID';
COMMENT ON TABLE "donor_session"           IS 'Сессии кабинета: одно устройство — одна строка';
COMMENT ON TABLE "donor_refresh_token"     IS 'Цепочка refresh-токенов сессии; только SHA-256';
COMMENT ON TABLE "donor_oauth_state"       IS 'Начатые входы через VK ID: state (хеш) и PKCE code_verifier, 10 минут';
COMMENT ON TABLE "tax_certificate_request" IS 'Заявки на справку для налогового вычета; PDF готовит бухгалтер';
