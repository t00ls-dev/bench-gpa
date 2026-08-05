-- Physically reorders users.employee_id to right after `id`, before
-- `username`. Purely cosmetic: same type/nullability/uniqueness, no data
-- change. Safe as a single migration (not the additive-first 3-PR pattern)
-- because no query in the app relies on column position (`SELECT *` isn't
-- used anywhere against `users`; every query names its columns).
-- Naturally idempotent: rerunning just sets the same position again.
ALTER TABLE users
  MODIFY COLUMN employee_id VARCHAR(30) NULL AFTER id;
