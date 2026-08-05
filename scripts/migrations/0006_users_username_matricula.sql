-- Substitui e-mail por username/matrícula como identificador de login, e
-- introduz o estado de senha ausente/expirada.
--
-- username/matricula nascem NULL UNIQUE: usuários legados migrados de e-mail
-- podem ter só um dos dois definido (a parte local do e-mail já era um deles,
-- dependendo do formato -- ver scripts/migrate-users-to-username.ts), o outro
-- fica pendente até o admin completar via updateUserIdentifiers. UNIQUE sobre
-- coluna NULL é seguro em MariaDB: múltiplos NULL não colidem entre si.
--
-- password passa a aceitar NULL: conta criada pelo admin nasce sem senha
-- (fluxo de primeiro acesso definida em setInitialPassword), e reset de senha
-- por admin volta ao mesmo estado (zera password e password_changed_at) em
-- vez de definir uma senha temporária.
--
-- password_changed_at: base da expiração de 30 dias (ver passwordChangeRequired
-- em session.ts). O backfill abaixo dá a todo usuário já com senha real uma
-- janela cheia de 30 dias a partir deste deploy, em vez de forçar troca em
-- massa no primeiro login pós-deploy.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS username VARCHAR(60) NULL AFTER id,
  ADD COLUMN IF NOT EXISTS matricula VARCHAR(30) NULL AFTER username,
  ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMP NULL DEFAULT NULL AFTER token_version;

ALTER TABLE users
  MODIFY COLUMN password VARCHAR(255) NULL;

ALTER TABLE users
  ADD UNIQUE INDEX IF NOT EXISTS idx_users_username (username),
  ADD UNIQUE INDEX IF NOT EXISTS idx_users_matricula (matricula);

UPDATE users
SET password_changed_at = NOW()
WHERE password IS NOT NULL AND password_changed_at IS NULL;
