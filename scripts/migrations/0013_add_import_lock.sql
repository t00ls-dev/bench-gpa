-- A singleton lease serializes the destructive import pipeline across the
-- web app, direct CLI, browser tabs, and app reloads. The row stays in place;
-- procedures only fill or clear its ownership fields.
CREATE TABLE IF NOT EXISTS import_locks (
  lock_name     VARCHAR(32) NOT NULL PRIMARY KEY,
  batch_id      VARCHAR(36) NULL,
  sale_date     DATE NULL,
  user_id       VARCHAR(36) NULL,
  stores_json   JSON NULL,
  products_json JSON NULL,
  acquired_at  DATETIME(3) NULL,
  heartbeat_at DATETIME(3) NULL,
  expires_at    DATETIME(3) NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO import_locks (lock_name) VALUES ('sales_import');
