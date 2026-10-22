-- Этапы сбора («малые цели») для первого экрана главной.
-- Строго аддитивно: новый enum, новая таблица, её индексы, CHECK и триггеры.
-- Существующие таблицы и данные пожертвований не меняются; индекс для
-- агрегации не нужен — запрос «собрано» идёт по уже существующему
-- "donation_status_paid_at_id_idx" (status, paid_at DESC, id DESC).

-- CreateEnum
CREATE TYPE "fundraising_goal_status" AS ENUM ('ACTIVE', 'DRAFT', 'COMPLETED', 'ARCHIVED');

-- CreateTable
CREATE TABLE "fundraising_goal" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "campaign_id" UUID NOT NULL,
    "title" VARCHAR(80) NOT NULL,
    "description" VARCHAR(200),
    "target_amount_kopecks" BIGINT NOT NULL,
    "starts_at" TIMESTAMPTZ(3) NOT NULL,
    "ends_at" TIMESTAMPTZ(3),
    "status" "fundraising_goal_status" NOT NULL DEFAULT 'DRAFT',
    "manual_adjustment_kopecks" BIGINT NOT NULL DEFAULT 0,
    "completed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_by" UUID,

    CONSTRAINT "fundraising_goal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "fundraising_goal_status_created_at_idx" ON "fundraising_goal"("status", "created_at" DESC);

-- CreateIndex
CREATE INDEX "fundraising_goal_campaign_id_idx" ON "fundraising_goal"("campaign_id");

-- AddForeignKey
ALTER TABLE "fundraising_goal" ADD CONSTRAINT "fundraising_goal_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fundraising_goal" ADD CONSTRAINT "fundraising_goal_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "admin_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fundraising_goal" ADD CONSTRAINT "fundraising_goal_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "admin_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ─── Инварианты, которые Prisma выразить не умеет ──────────────────────────

ALTER TABLE "fundraising_goal"
  -- Длина — без пробелов по краям: «   а   » не название. Сервис уже обрезает.
  ADD CONSTRAINT "fundraising_goal_title_length"
    CHECK ("title" = btrim("title") AND char_length("title") BETWEEN 3 AND 80),
  ADD CONSTRAINT "fundraising_goal_description_length"
    CHECK ("description" IS NULL OR char_length("description") BETWEEN 1 AND 200),
  -- От 1 000 ₽ до 100 000 000 ₽, в копейках.
  ADD CONSTRAINT "fundraising_goal_target_range"
    CHECK ("target_amount_kopecks" BETWEEN 100000 AND 10000000000),
  -- Корректировка по модулю не больше потолка цели: граница против лишнего нуля.
  ADD CONSTRAINT "fundraising_goal_adjustment_range"
    CHECK ("manual_adjustment_kopecks" BETWEEN -10000000000 AND 10000000000),
  ADD CONSTRAINT "fundraising_goal_period_order"
    CHECK ("ends_at" IS NULL OR "ends_at" > "starts_at"),
  -- Завершённый этап знает, когда его завершили.
  ADD CONSTRAINT "fundraising_goal_completed_at"
    CHECK ("status" <> 'COMPLETED' OR "completed_at" IS NOT NULL);

-- Активный этап — не больше одного на всю базу. Активация новой цели и
-- завершение текущей идут одной транзакцией; две параллельные активации
-- упираются в этот индекс, и вторая получает 23505 → 409.
CREATE UNIQUE INDEX "fundraising_goal_single_active"
  ON "fundraising_goal" ("status") WHERE "status" = 'ACTIVE';

-- Переходы статуса: в DRAFT не возвращаются, из ARCHIVED не выходят.
CREATE FUNCTION "fundraising_goal_status_guard"() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'fundraising_goal: физическое удаление запрещено, используйте ARCHIVED'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW."status" IS DISTINCT FROM OLD."status" THEN
    IF OLD."status" = 'ARCHIVED' THEN
      RAISE EXCEPTION 'fundraising_goal: из ARCHIVED выйти нельзя'
        USING ERRCODE = 'check_violation';
    END IF;

    IF NEW."status" = 'DRAFT' THEN
      RAISE EXCEPTION 'fundraising_goal: вернуть в DRAFT нельзя'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "fundraising_goal_status_guard_bu"
  BEFORE UPDATE OF "status" ON "fundraising_goal"
  FOR EACH ROW EXECUTE FUNCTION "fundraising_goal_status_guard"();

CREATE TRIGGER "fundraising_goal_status_guard_bd"
  BEFORE DELETE ON "fundraising_goal"
  FOR EACH ROW EXECUTE FUNCTION "fundraising_goal_status_guard"();

COMMENT ON TABLE  "fundraising_goal" IS 'Этапы сбора для первого экрана: наглядность, не отдельное назначение средств';
COMMENT ON COLUMN "fundraising_goal"."manual_adjustment_kopecks" IS 'Поступления мимо сайта (СБП по QR, наличные, реквизиты); может быть < 0, итог не ниже 0';
