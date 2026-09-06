ALTER TABLE users
  ADD COLUMN IF NOT EXISTS last_activity_at DATETIME NULL AFTER last_login_at;

UPDATE users
SET last_activity_at = last_login_at,
    updated_at = updated_at
WHERE last_activity_at IS NULL
  AND last_login_at IS NOT NULL;
