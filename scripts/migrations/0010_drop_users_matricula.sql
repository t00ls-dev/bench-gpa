-- Removes users.matricula: last step of the matricula -> employee_id
-- rename (English-naming standardization, phase 2a). PR 1 added
-- employee_id additively and backfilled it from matricula
-- (migrations/0009_users_employee_id.sql); PR 2 cut every app code path
-- over to employee_id. Run only after confirming production stability
-- with the new column.
--
-- DROP COLUMN IF EXISTS: no-op on a fresh install, since the baseline
-- (migrate-schema.sql) no longer creates this column as of this PR.
ALTER TABLE users
  DROP COLUMN IF EXISTS matricula;
