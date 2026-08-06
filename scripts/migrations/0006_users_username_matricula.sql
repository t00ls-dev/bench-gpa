-- Replaces email with username/matricula as the login identifier, and
-- introduces the missing/expired password state.
--
-- username/matricula are born NULL UNIQUE: legacy users migrated from email
-- may have only one of the two set (the email's local part was already one
-- of them, depending on the format, see scripts/migrate-users-to-username.ts),
-- the other stays pending until the admin fills it in via
-- updateUserIdentifiers. UNIQUE over a NULL column is safe in MariaDB:
-- multiple NULLs don't collide with each other.
--
-- password now accepts NULL: an account created by the admin is born
-- without a password (the first-access flow defined in setInitialPassword),
-- and a password reset by the admin goes back to that same state (clears
-- password and password_changed_at) instead of setting a temporary
-- password.
--
-- password_changed_at: the basis for the 30-day expiration (see
-- passwordChangeRequired in session.ts). The backfill below gives every
-- user who already has a real password a full 30-day window from this
-- deploy, instead of forcing a mass password change on the first login
-- after deploy.
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
