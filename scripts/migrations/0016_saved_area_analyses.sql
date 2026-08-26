-- Persist the identity of a saved area analysis separately from the UI
-- filters used to select its products. Each analysis belongs to one store;
-- product membership is validated against product_universe by the app.
CREATE TABLE IF NOT EXISTS saved_area_analyses (
  id            VARCHAR(36) NOT NULL PRIMARY KEY,
  owner_user_id VARCHAR(36) NOT NULL,
  name          VARCHAR(255) NOT NULL,
  store_code    VARCHAR(20) NOT NULL,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_saved_area_analyses_owner_updated (owner_user_id, updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS saved_area_analysis_products (
  analysis_id VARCHAR(36) NOT NULL,
  prod_code   VARCHAR(20) NOT NULL,
  PRIMARY KEY (analysis_id, prod_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
