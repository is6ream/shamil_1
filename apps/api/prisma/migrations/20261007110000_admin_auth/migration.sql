-- Пользователи админки и refresh-токены. Аддитивно: новые таблицы и enum.

-- CreateEnum
CREATE TYPE "admin_role" AS ENUM ('SUPER_ADMIN', 'EDITOR', 'ACCOUNTANT');

-- CreateTable
CREATE TABLE "admin_user" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" VARCHAR(254) NOT NULL,
    "password_hash" VARCHAR(100) NOT NULL,
    "role" "admin_role" NOT NULL,
    "display_name" VARCHAR(120),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "failed_login_count" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMPTZ(3),
    "last_login_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_refresh_token" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "family_id" UUID NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "revoked_at" TIMESTAMPTZ(3),
    "user_agent" VARCHAR(256),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_refresh_token_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "admin_user_email_key" ON "admin_user"("email");

-- CreateIndex
CREATE UNIQUE INDEX "admin_refresh_token_token_hash_key" ON "admin_refresh_token"("token_hash");

-- CreateIndex
CREATE INDEX "admin_refresh_token_user_id_idx" ON "admin_refresh_token"("user_id");

-- CreateIndex
CREATE INDEX "admin_refresh_token_family_id_idx" ON "admin_refresh_token"("family_id");

-- AddForeignKey
ALTER TABLE "admin_refresh_token" ADD CONSTRAINT "admin_refresh_token_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "admin_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Email храним в нижнем регистре: иначе «Admin@x.ru» и «admin@x.ru» — два аккаунта.
ALTER TABLE "admin_user"
  ADD CONSTRAINT "admin_user_email_lowercase" CHECK ("email" = lower("email")),
  ADD CONSTRAINT "admin_user_failed_login_not_negative" CHECK ("failed_login_count" >= 0);

COMMENT ON TABLE "admin_user"          IS 'Пользователи админки; регистрации нет, первый суперадмин — из сида';
COMMENT ON TABLE "admin_refresh_token" IS 'Refresh-токены админки: только SHA-256, ротация с семейством';
