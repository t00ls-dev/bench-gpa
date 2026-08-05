-- Renomeia audit_log.actor_email -> actor_username (e ajusta o tamanho para
-- VARCHAR(60), mesmo domínio de users.username). Parte da remoção completa de
-- e-mail do sistema, em favor de username/matrícula.
--
-- MariaDB não tem `RENAME COLUMN ... IF EXISTS`. Numa instalação nova, o
-- baseline (migrate-schema.sql) já cria a tabela com actor_username desde o
-- início, então a coluna antiga nunca existe -- rodar o RENAME direto quebraria
-- ali (mesma classe de bug documentada em 0003_token_version.sql). A checagem
-- via information_schema + SQL dinâmico torna esta migration um no-op seguro
-- nesse caso.
SET @col_exists = (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'audit_log'
    AND COLUMN_NAME = 'actor_email'
);

SET @ddl = IF(
  @col_exists > 0,
  'ALTER TABLE audit_log CHANGE COLUMN actor_email actor_username VARCHAR(60)',
  'SELECT 1'
);

PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
