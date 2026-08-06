-- Removes users.email: the last step of the migration to username/matricula
-- (PR 1 added the new columns and migrated the real data in production via
-- scripts/migrate-users-to-username.ts; PR 2 changed all the auth code to
-- no longer depend on email). Run only after confirming stability in
-- production with the new model.
--
-- DROP COLUMN IF EXISTS: a no-op on a fresh install, since the baseline
-- (migrate-schema.sql) no longer creates this column since PR 1.
ALTER TABLE users
  DROP COLUMN IF EXISTS email;
