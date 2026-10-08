-- Журнал действий админки. Аддитивно: новая таблица, ограничения и триггер.

-- CreateTable
CREATE TABLE "audit_log" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "occurred_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actor_type" VARCHAR(16) NOT NULL,
    "actor_id" UUID,
    "actor_role" "admin_role",
    "actor_label" VARCHAR(254),
    "action" VARCHAR(64) NOT NULL,
    "entity_type" VARCHAR(64) NOT NULL,
    "entity_id" VARCHAR(128),
    "before" JSONB,
    "after" JSONB,
    "ip" INET,
    "user_agent" VARCHAR(256),

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "audit_log_occurred_at_id_idx" ON "audit_log"("occurred_at" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "audit_log_entity_type_entity_id_idx" ON "audit_log"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "audit_log_actor_id_occurred_at_idx" ON "audit_log"("actor_id", "occurred_at" DESC);

-- CreateIndex
CREATE INDEX "audit_log_action_occurred_at_idx" ON "audit_log"("action", "occurred_at" DESC);

-- Пользовательское действие обязано называть пользователя; системное — нет.
ALTER TABLE "audit_log"
  ADD CONSTRAINT "audit_log_actor_type_allowed" CHECK ("actor_type" IN ('user', 'system')),
  ADD CONSTRAINT "audit_log_user_has_id" CHECK ("actor_type" <> 'user' OR "actor_id" IS NOT NULL);

-- Журнал только дописывается. Правка или удаление записи — это уже не журнал,
-- а то, что он должен ловить. TRUNCATE построчные триггеры не вызывает —
-- им пользуются тесты, на проде у приложения нет причин его выполнять.
CREATE OR REPLACE FUNCTION "audit_log_append_only"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'AUDIT_LOG_APPEND_ONLY: журнал действий не редактируется и не удаляется'
    USING ERRCODE = 'ZS003';
END;
$$;

CREATE TRIGGER "audit_log_append_only_bud"
  BEFORE UPDATE OR DELETE ON "audit_log"
  FOR EACH ROW EXECUTE FUNCTION "audit_log_append_only"();

COMMENT ON TABLE "audit_log" IS 'Журнал действий админки: только дописывается, ПДн в before/after замаскированы';
