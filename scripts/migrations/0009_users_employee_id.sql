-- Adds users.employee_id as an additive copy of the legacy `matricula`
-- column (English-naming standardization, phase 2a). Both columns coexist
-- until the app cutover (next PR) and the cleanup PR that drops `matricula`
-- afterward: same additive-first pattern used for the email -> username/
-- matricula migration (see migrations/0006_users_username_matricula.sql).
--
-- Deploy applies migrations before the atomic release swap (see
-- .github/workflows/ci.yml), so the previous app code keeps reading/writing
-- `matricula` for the few seconds until the new release activates. A plain
-- RENAME COLUMN here would break every login/user-list query during that
-- window; ADD COLUMN + backfill keeps it additive instead.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS employee_id VARCHAR(30) NULL AFTER matricula;

ALTER TABLE users
  ADD UNIQUE INDEX IF NOT EXISTS idx_users_employee_id (employee_id);

UPDATE users
SET employee_id = matricula
WHERE employee_id IS NULL AND matricula IS NOT NULL;
