-- Renames audit_log.actor_email -> actor_username (and adjusts the size to
-- VARCHAR(60), same domain as users.username). Part of removing email from
-- the system entirely, in favor of username/matricula.
--
-- MariaDB doesn't have `RENAME COLUMN ... IF EXISTS`. On a fresh install,
-- the baseline (migrate-schema.sql) already creates the table with
-- actor_username from the start, so the old column never exists, running
-- the RENAME directly would break there (same bug class documented in
-- 0003_token_version.sql). The check via information_schema + dynamic SQL
-- makes this migration a safe no-op in that case.
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
