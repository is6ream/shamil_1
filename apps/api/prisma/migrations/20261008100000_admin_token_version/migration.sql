-- Версия сессий пользователя админки. Аддитивно: новая колонка с DEFAULT.
-- Access-JWT несёт версию; смена пароля, роли или деактивация увеличивают её,
-- и уже выданные access-токены перестают приниматься сразу.

ALTER TABLE "admin_user" ADD COLUMN "token_version" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "admin_user"
  ADD CONSTRAINT "admin_user_token_version_not_negative" CHECK ("token_version" >= 0);
