-- =============================================
-- Bench GPA: Schema + Stored Procedures (MariaDB 11.4)
-- =============================================

DROP PROCEDURE IF EXISTS dashboard_metrics;
DROP PROCEDURE IF EXISTS dashboard_rankings;
DROP PROCEDURE IF EXISTS filter_options;
DROP PROCEDURE IF EXISTS area_analysis;
DROP PROCEDURE IF EXISTS area_analysis_v2;
DROP PROCEDURE IF EXISTS area_filter_hierarchy;
DROP PROCEDURE IF EXISTS product_search;
DROP PROCEDURE IF EXISTS get_product_by_code;
DROP PROCEDURE IF EXISTS product_analysis;
DROP PROCEDURE IF EXISTS upsert_products_bulk;
DROP PROCEDURE IF EXISTS acquire_import_lock_checked;
DROP PROCEDURE IF EXISTS acquire_import_lock;
DROP PROCEDURE IF EXISTS renew_import_lock;
DROP PROCEDURE IF EXISTS release_import_lock;
DROP PROCEDURE IF EXISTS finalize_import;
DROP PROCEDURE IF EXISTS imported_dates;
DROP PROCEDURE IF EXISTS purge_old_aggs;
DROP PROCEDURE IF EXISTS db_health_check;
DROP PROCEDURE IF EXISTS refresh_filter_hierarchy;
DROP PROCEDURE IF EXISTS refresh_product_universe;
DROP PROCEDURE IF EXISTS has_role;
DROP PROCEDURE IF EXISTS production_forecast;

-- =============================================
-- TABLES
-- =============================================

-- No FOREIGN KEY on any table: a deliberate decision, not an oversight.
-- staging_sales/sales_daily_agg/sales_prod_daily_agg/products are rewritten
-- in bulk (upsert_products_bulk, finalize_import, refresh_product_universe,
-- purge_old_aggs do INSERT...ON DUPLICATE KEY and DELETE of thousands of
-- rows at once); an FK would force row-by-row referential checks on those
-- paths, with no real gain: prod_code/store_code integrity is already
-- guaranteed by the import pipeline itself (staging -> aggregation in the
-- same transaction), not by a database constraint.

-- token_version: counter that invalidates already-issued sessions. The JWT
-- is stateless and lasts 7 days, so without this, resetting a compromised
-- account's password wouldn't log out whoever was already signed in. The
-- token carries the version current at issuance; requireAuth/getMe compare
-- it against the database's, and resetPassword increments it.
-- See migrations/0003_token_version.sql.
--
-- username/employee_id NULL UNIQUE: nullable only to accommodate legacy
-- users migrated from the email model, who may have only one of the two set
-- until the admin completes the other (see
-- migrations/0006_users_username_matricula.sql). employee_id was born as
-- `matricula` in that migration and was renamed in
-- migrations/0009_users_employee_id.sql +
-- migrations/0010_drop_users_matricula.sql (naming standardization,
-- 2026-08-05). Registering a new user through the admin requires both via
-- Zod (UsernameSchema/EmployeeIdSchema in schemas.ts), not via NOT NULL on
-- the database side.
--
-- password NULL: account created without a password (first access) or
-- cleared by an admin reset. password_changed_at NULL or older than 30 days
-- forces a change on the next login (see passwordChangeRequired in
-- session.ts). Both fields treat NULL as "needs action" (fail-safe), never
-- as "everything's fine".
CREATE TABLE IF NOT EXISTS users (
  id            VARCHAR(36) PRIMARY KEY,
  employee_id   VARCHAR(30) NULL UNIQUE,
  username      VARCHAR(60) NULL UNIQUE,
  name          VARCHAR(255) NOT NULL,
  password      VARCHAR(255) NULL,
  role          ENUM('admin','user') NOT NULL DEFAULT 'user',
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  token_version INT NOT NULL DEFAULT 0,
  password_changed_at TIMESTAMP NULL DEFAULT NULL,
  last_login_at DATETIME NULL,
  last_activity_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_users_role (role),
  INDEX idx_users_is_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS stores (
  store_code VARCHAR(20) PRIMARY KEY,
  store_name VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- A saved area analysis is a durable product composition for exactly one
-- store. Category filters are only selection aids in the UI and are not part
-- of the persisted domain model.
CREATE TABLE IF NOT EXISTS saved_area_analyses (
  id            VARCHAR(36) NOT NULL PRIMARY KEY,
  owner_user_id VARCHAR(36) NOT NULL,
  name          VARCHAR(255) NOT NULL,
  description   VARCHAR(1000) NULL,
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

CREATE TABLE IF NOT EXISTS products (
  prod_code VARCHAR(20) NOT NULL,
  prod_name VARCHAR(255) NOT NULL,
  sale_date DATE NOT NULL,
  PRIMARY KEY (prod_code, sale_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS staging_sales (
  id           BIGINT AUTO_INCREMENT PRIMARY KEY,
  sale_date    DATE NOT NULL,
  batch_id     VARCHAR(36) NOT NULL,
  store_code   VARCHAR(20) NOT NULL,
  store_name   VARCHAR(255),
  prod_code    VARCHAR(20) NOT NULL,
  prod_name    VARCHAR(255),
  depto        VARCHAR(100),
  secao        VARCHAR(100),
  grupo        VARCHAR(100),
  subgrupo     VARCHAR(100),
  val_vda      DECIMAL(15,2) NOT NULL DEFAULT 0,
  INDEX idx_staging_batch (batch_id),
  INDEX idx_staging_sale_date (sale_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Singleton lease for the import pipeline. A database lease, rather than
-- process memory, also covers the direct CLI and survives app reloads.
CREATE TABLE IF NOT EXISTS import_locks (
  lock_name    VARCHAR(32) NOT NULL PRIMARY KEY,
  batch_id     VARCHAR(36) NULL,
  sale_date    DATE NULL,
  user_id      VARCHAR(36) NULL,
  stores_json  JSON NULL,
  products_json JSON NULL,
  acquired_at DATETIME(3) NULL,
  heartbeat_at DATETIME(3) NULL,
  expires_at   DATETIME(3) NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO import_locks (lock_name) VALUES ('sales_import');

-- VAL_VDA is the ONLY measure that exists. Don't look for quantity, cost,
-- returns, or margin: the GPA export doesn't carry any of that.
--
-- Verified on 2026-07-23 across the 68 spreadsheets in data/ (May to July
-- 2026), all with 24 columns and the same header:
--
--   NOM_DEPTO | NOM_SECAO | NOM_GRUPO | NOM_SUBGRUPO | NOM_PROD | VAL_VDA x N stores | Total
--
-- These tables used to carry qty_vda, val_cus, val_dev, val_sld, and per_mrg
-- (plus seven more variants in staging), all structurally zero for lack of
-- a source. Removed in migration 0002. If the export ever starts carrying
-- these measures, reintroduce the columns along with the parser that fills
-- them in, and not before.
CREATE TABLE IF NOT EXISTS sales_daily_agg (
  sale_date   DATE NOT NULL,
  store_code  VARCHAR(20) NOT NULL,
  val_vda     DECIMAL(15,2) NOT NULL DEFAULT 0,
  PRIMARY KEY (sale_date, store_code),
  INDEX idx_daily_sale_date (sale_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Deliberately no STANDALONE index on depto/secao/grupo/subgrupo: no
-- analysis proc with OPTIONAL filters benefits from one (filtering by any
-- of them cost more than not filtering, since the real access plan is
-- always a scan by sale_date). The 4 combined once took up 532.81 MB, 74.7%
-- of the table's index. Removed in production and measured on 2026-07-30
-- (see scripts/migrations/0004_drop_indices_categoria_sales_prod_daily_agg.sql
-- and docs/medicao-performance.md): identical hash across the procs, no
-- read regression. Don't recreate a standalone one without measuring again.
--
-- The composite index below is a DIFFERENT case: production_forecast always
-- filters one store and joins current product identity over a date range.
-- Migration 0014 documents why it replaced the historical-depto index.
CREATE TABLE IF NOT EXISTS sales_prod_daily_agg (
  sale_date   DATE NOT NULL,
  store_code  VARCHAR(20) NOT NULL,
  prod_code   VARCHAR(20) NOT NULL,
  prod_name   VARCHAR(255),
  depto       VARCHAR(100),
  secao       VARCHAR(100),
  grupo       VARCHAR(100),
  subgrupo    VARCHAR(100),
  val_vda     DECIMAL(15,2) NOT NULL DEFAULT 0,
  PRIMARY KEY (sale_date, store_code, prod_code),
  INDEX idx_prod_daily_store_prod_date (store_code, prod_code, sale_date),
  INDEX idx_prod_daily_prod_code (prod_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS import_log (
  id          BIGINT AUTO_INCREMENT PRIMARY KEY,
  sale_date   DATE NOT NULL UNIQUE,
  row_count   INT NOT NULL DEFAULT 0,
  imported_by VARCHAR(36),
  imported_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  batch_id    VARCHAR(36) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS filter_hierarchy (
  id          BIGINT AUTO_INCREMENT PRIMARY KEY,
  store_code  VARCHAR(20) NOT NULL,
  store_name  VARCHAR(255) NOT NULL,
  depto       VARCHAR(100),
  secao       VARCHAR(100),
  grupo       VARCHAR(100),
  subgrupo    VARCHAR(100),
  INDEX idx_filter_store (store_code),
  INDEX idx_filter_depto (depto),
  INDEX idx_filter_secao (secao),
  INDEX idx_filter_grupo (grupo),
  INDEX idx_filter_subgrupo (subgrupo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- PLU universe: one row per (prod_code, store_code) that has ALREADY sold at
-- least once within the retention window, with the category and name from
-- the most recent sale, plus that sale's date.
--
-- Derived from sales_prod_daily_agg (like filter_hierarchy), regenerated by
-- refresh_product_universe() in a daily cron (scripts/refresh-universe.ts),
-- no longer at the end of every import/purge (see the comment in
-- finalize_import for why, docs/continuar.md item 5).
--
-- Exists for performance. The "PLUs without a sale" KPI needs to compare
-- the period against the entire history; doing that directly on
-- sales_prod_daily_agg costs a COUNT(DISTINCT) over ~3.4M rows: measured at
-- 4.6s against 0.4s for the period-only query, on a screen with no cache.
-- Here it's ~176k rows.
CREATE TABLE IF NOT EXISTS product_universe (
  prod_code      VARCHAR(20)  NOT NULL,
  store_code     VARCHAR(20)  NOT NULL,
  prod_name      VARCHAR(255),
  depto          VARCHAR(100),
  secao          VARCHAR(100),
  grupo          VARCHAR(100),
  subgrupo       VARCHAR(100),
  last_sale_date DATE NOT NULL,
  PRIMARY KEY (prod_code, store_code),
  INDEX idx_pu_store (store_code),
  INDEX idx_pu_depto (depto),
  INDEX idx_pu_secao (secao),
  INDEX idx_pu_grupo (grupo),
  INDEX idx_pu_subgrupo (subgrupo),
  INDEX idx_pu_last_sale (last_sale_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Audit trail: sensitive auth and admin actions.
-- actor_username is deliberately denormalized: the record needs to survive
-- even if the user is later removed.
CREATE TABLE IF NOT EXISTS audit_log (
  id          BIGINT AUTO_INCREMENT PRIMARY KEY,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actor_id    VARCHAR(36),
  actor_username VARCHAR(60),
  action      VARCHAR(60) NOT NULL,
  target_type VARCHAR(40),
  target_id   VARCHAR(255),
  detail      VARCHAR(500),
  ip          VARCHAR(45),
  INDEX idx_audit_created (created_at),
  INDEX idx_audit_actor (actor_id),
  INDEX idx_audit_action (action)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Cron heartbeat: each job upserts its own last run so the admin panel can
-- show whether it's running on schedule.
CREATE TABLE IF NOT EXISTS cron_heartbeat (
  job              VARCHAR(40) PRIMARY KEY,
  last_run_at      TIMESTAMP NULL DEFAULT NULL,
  last_status      ENUM('ok','fail'),
  last_detail      VARCHAR(500),
  last_duration_ms INT,
  updated_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================
-- STORED PROCEDURES
-- =============================================

DELIMITER //

-- 1/20: dashboard_metrics
CREATE PROCEDURE dashboard_metrics(
  p_date_from DATE,
  p_date_to DATE,
  p_stores JSON,
  p_deptos JSON,
  p_secoes JSON,
  p_grupos JSON,
  p_subgrupos JSON
)
BEGIN
  DROP TEMPORARY TABLE IF EXISTS tmp_filters;
  CREATE TEMPORARY TABLE tmp_filters (
    store_code VARCHAR(20),
    depto VARCHAR(100),
    secao VARCHAR(100),
    grupo VARCHAR(100),
    subgrupo VARCHAR(100)
  ) ENGINE=MEMORY DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

  IF JSON_LENGTH(p_stores) > 0 THEN
    INSERT INTO tmp_filters (store_code)
    SELECT DISTINCT value FROM JSON_TABLE(p_stores, '$[*]' COLUMNS (value VARCHAR(20) PATH '$')) AS j;
  END IF;
  IF JSON_LENGTH(p_deptos) > 0 THEN
    INSERT INTO tmp_filters (depto)
    SELECT DISTINCT value FROM JSON_TABLE(p_deptos, '$[*]' COLUMNS (value VARCHAR(100) PATH '$')) AS j;
  END IF;
  IF JSON_LENGTH(p_secoes) > 0 THEN
    INSERT INTO tmp_filters (secao)
    SELECT DISTINCT value FROM JSON_TABLE(p_secoes, '$[*]' COLUMNS (value VARCHAR(100) PATH '$')) AS j;
  END IF;
  IF JSON_LENGTH(p_grupos) > 0 THEN
    INSERT INTO tmp_filters (grupo)
    SELECT DISTINCT value FROM JSON_TABLE(p_grupos, '$[*]' COLUMNS (value VARCHAR(100) PATH '$')) AS j;
  END IF;
  IF JSON_LENGTH(p_subgrupos) > 0 THEN
    INSERT INTO tmp_filters (subgrupo)
    SELECT DISTINCT value FROM JSON_TABLE(p_subgrupos, '$[*]' COLUMNS (value VARCHAR(100) PATH '$')) AS j;
  END IF;

  -- ONE scan of sales_prod_daily_agg, not four.
  --
  -- The four result sets need three grains: sale_date (byDate), store_code
  -- (byStore), and depto (byDepto); the total is the sum of everything.
  -- Each one used to come from its own scan of the entire table: the same
  -- ~1.4M rows re-read four times to group by a different column. Measured
  -- in prod (docs/medicao-performance.md): 46.3s on a 28-day window, the
  -- most expensive proc in the system.
  --
  -- The common grain (sale_date, store_code, depto) collapses those ~1.4M
  -- rows into a few thousand: 56 dates x ~10 stores x ~20 departments.
  -- Summing again from it gives exactly the same number: SUM is
  -- associative, and none of the four result sets needs a finer grain than
  -- this. If one ever does (by seção, by product), the temp table's grain
  -- has to grow along with it, or the number comes out wrong with nothing
  -- flagging it.
  --
  -- Deliberately CREATE ... AS SELECT instead of a declared table: preserves
  -- the type SUM produces, with no risk of truncating into a hand-picked DECIMAL.
  DROP TEMPORARY TABLE IF EXISTS tmp_period;
  CREATE TEMPORARY TABLE tmp_period ENGINE=InnoDB AS
  SELECT a.sale_date, a.store_code, u.depto, SUM(a.val_vda) AS val
  FROM sales_prod_daily_agg a
  INNER JOIN product_universe u ON u.prod_code = a.prod_code AND u.store_code = a.store_code
  WHERE (p_date_from IS NULL OR a.sale_date >= p_date_from)
    AND (p_date_to IS NULL OR a.sale_date <= p_date_to)
    AND (NOT EXISTS (SELECT 1 FROM tmp_filters t WHERE t.store_code IS NOT NULL)
      OR u.store_code IN (SELECT t.store_code FROM tmp_filters t WHERE t.store_code IS NOT NULL))
    AND (NOT EXISTS (SELECT 1 FROM tmp_filters t WHERE t.depto IS NOT NULL)
      OR u.depto IN (SELECT t.depto FROM tmp_filters t WHERE t.depto IS NOT NULL))
    AND (NOT EXISTS (SELECT 1 FROM tmp_filters t WHERE t.secao IS NOT NULL)
      OR u.secao IN (SELECT t.secao FROM tmp_filters t WHERE t.secao IS NOT NULL))
    AND (NOT EXISTS (SELECT 1 FROM tmp_filters t WHERE t.grupo IS NOT NULL)
      OR u.grupo IN (SELECT t.grupo FROM tmp_filters t WHERE t.grupo IS NOT NULL))
    AND (NOT EXISTS (SELECT 1 FROM tmp_filters t WHERE t.subgrupo IS NOT NULL)
      OR u.subgrupo IN (SELECT t.subgrupo FROM tmp_filters t WHERE t.subgrupo IS NOT NULL))
  GROUP BY a.sale_date, a.store_code, u.depto;

  -- Result set 1: aggregates
  -- Only `total` is read (callMetrics, in src/lib/api-types.ts). This
  -- SELECT also used to compute total_plus/plus_with_sale/plus_without_sale,
  -- which TypeScript discarded: three COUNT(DISTINCT prod_code) over the
  -- filtered sales_prod_daily_agg window on every call, with no reader at
  -- all. The equivalent KPIs that actually exist live in area_analysis,
  -- which delivers them to the Area screen. Don't confuse the two.
  SELECT COALESCE(SUM(val), 0) AS total FROM tmp_period;

  -- Result set 2: byStore
  -- store_name is functionally dependent on store_code, so joining after
  -- aggregating gives the same result as joining before, and joins against
  -- a few thousand rows instead of millions.
  SELECT p.store_code AS code, s.store_name AS name, SUM(p.val) AS val
  FROM tmp_period p
  LEFT JOIN stores s ON s.store_code = p.store_code
  GROUP BY p.store_code, s.store_name
  ORDER BY val DESC;

  -- Result set 3: byDepto
  -- The IS NOT NULL moved to the rollup. Gives the same set: depto is part
  -- of the grain's key, so discarding the NULL group here is identical to
  -- having discarded the rows before grouping.
  SELECT p.depto AS name, SUM(p.val) AS val
  FROM tmp_period p
  WHERE p.depto IS NOT NULL
  GROUP BY p.depto
  ORDER BY val DESC;

  -- Result set 4: byDate
  SELECT p.sale_date AS date, SUM(p.val) AS val
  FROM tmp_period p
  GROUP BY p.sale_date
  ORDER BY p.sale_date;

  DROP TEMPORARY TABLE IF EXISTS tmp_period;
  DROP TEMPORARY TABLE IF EXISTS tmp_filters;
END//

-- 2/20: dashboard_rankings
CREATE PROCEDURE dashboard_rankings(
  p_date_from DATE,
  p_date_to DATE,
  p_stores JSON,
  p_deptos JSON,
  p_secoes JSON,
  p_grupos JSON,
  p_subgrupos JSON,
  p_limit INT
)
BEGIN
  DROP TEMPORARY TABLE IF EXISTS tmp_filters;
  CREATE TEMPORARY TABLE tmp_filters (
    store_code VARCHAR(20),
    depto VARCHAR(100),
    secao VARCHAR(100),
    grupo VARCHAR(100),
    subgrupo VARCHAR(100)
  ) ENGINE=MEMORY DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

  IF JSON_LENGTH(p_stores) > 0 THEN
    INSERT INTO tmp_filters (store_code)
    SELECT DISTINCT value FROM JSON_TABLE(p_stores, '$[*]' COLUMNS (value VARCHAR(20) PATH '$')) AS j;
  END IF;
  IF JSON_LENGTH(p_deptos) > 0 THEN
    INSERT INTO tmp_filters (depto)
    SELECT DISTINCT value FROM JSON_TABLE(p_deptos, '$[*]' COLUMNS (value VARCHAR(100) PATH '$')) AS j;
  END IF;
  IF JSON_LENGTH(p_secoes) > 0 THEN
    INSERT INTO tmp_filters (secao)
    SELECT DISTINCT value FROM JSON_TABLE(p_secoes, '$[*]' COLUMNS (value VARCHAR(100) PATH '$')) AS j;
  END IF;
  IF JSON_LENGTH(p_grupos) > 0 THEN
    INSERT INTO tmp_filters (grupo)
    SELECT DISTINCT value FROM JSON_TABLE(p_grupos, '$[*]' COLUMNS (value VARCHAR(100) PATH '$')) AS j;
  END IF;
  IF JSON_LENGTH(p_subgrupos) > 0 THEN
    INSERT INTO tmp_filters (subgrupo)
    SELECT DISTINCT value FROM JSON_TABLE(p_subgrupos, '$[*]' COLUMNS (value VARCHAR(100) PATH '$')) AS j;
  END IF;

  SET @limit_val = COALESCE(p_limit, 10);

  -- ONE scan of sales_prod_daily_agg, not five.
  --
  -- The five rankings are five different groupings of the SAME slice:
  -- depto, seção, grupo, subgrupo, and product. Each one used to re-read
  -- the entire table to group by a column. Measured in prod
  -- (docs/medicao-performance.md): 32.4s on a 28-day window.
  --
  -- The fine grain (the four categories + product) is the smallest grain
  -- that serves all five: grouping by it and summing again gives exactly
  -- the same total, because SUM is associative and each ranking column is
  -- a projection of this key. Verified in prod: the result's hash is
  -- identical to the previous version's.
  --
  -- Measured: 30.7s -> 17.8s (-42%). NOT the 80% that "five scans become
  -- one" suggests, and the reason matters for whoever touches this later:
  -- materializing the temp table is expensive on its own (~1.4M rows
  -- collapsing into ~100k groups, written to disk). A variant with TWO
  -- cheaper temp tables (one at the category grain, another at the product
  -- grain) was measured and came out at 31.8s, i.e. the same as the
  -- original: the materialization cost is per temp table, not per row
  -- read. One pays off; two don't.
  DROP TEMPORARY TABLE IF EXISTS tmp_period;
  CREATE TEMPORARY TABLE tmp_period ENGINE=InnoDB AS
  SELECT u.depto, u.secao, u.grupo, u.subgrupo, a.prod_code, u.prod_name,
         SUM(a.val_vda) AS v
  FROM sales_prod_daily_agg a
  INNER JOIN product_universe u ON u.prod_code = a.prod_code AND u.store_code = a.store_code
  WHERE (p_date_from IS NULL OR a.sale_date >= p_date_from)
    AND (p_date_to IS NULL OR a.sale_date <= p_date_to)
    AND (NOT EXISTS (SELECT 1 FROM tmp_filters t WHERE t.store_code IS NOT NULL) OR u.store_code IN (SELECT t.store_code FROM tmp_filters t WHERE t.store_code IS NOT NULL))
    AND (NOT EXISTS (SELECT 1 FROM tmp_filters t WHERE t.depto IS NOT NULL) OR u.depto IN (SELECT t.depto FROM tmp_filters t WHERE t.depto IS NOT NULL))
    AND (NOT EXISTS (SELECT 1 FROM tmp_filters t WHERE t.secao IS NOT NULL) OR u.secao IN (SELECT t.secao FROM tmp_filters t WHERE t.secao IS NOT NULL))
    AND (NOT EXISTS (SELECT 1 FROM tmp_filters t WHERE t.grupo IS NOT NULL) OR u.grupo IN (SELECT t.grupo FROM tmp_filters t WHERE t.grupo IS NOT NULL))
    AND (NOT EXISTS (SELECT 1 FROM tmp_filters t WHERE t.subgrupo IS NOT NULL) OR u.subgrupo IN (SELECT t.subgrupo FROM tmp_filters t WHERE t.subgrupo IS NOT NULL))
  GROUP BY u.depto, u.secao, u.grupo, u.subgrupo, a.prod_code, u.prod_name;

  -- The temp table's column is named `v`, not `val`: the rollups return
  -- `SUM(v) AS val` and order by `val`. If the column were also named
  -- `val`, ORDER BY would have two possible resolutions: the server
  -- prefers the alias, but that isn't the kind of detail that should be
  -- holding up a ranking's ordering.
  --
  -- PREPARE stays because of LIMIT ?, which is the reason it exists here:
  -- the dates are no longer placeholders, they were already applied in the
  -- scan above.

  -- byDepto
  PREPARE stmt FROM 'SELECT depto AS name, SUM(v) AS val
    FROM tmp_period WHERE depto IS NOT NULL
    GROUP BY depto ORDER BY val DESC LIMIT ?';
  EXECUTE stmt USING @limit_val;
  DEALLOCATE PREPARE stmt;

  -- bySecao
  PREPARE stmt FROM 'SELECT depto, secao AS name, SUM(v) AS val
    FROM tmp_period WHERE secao IS NOT NULL
    GROUP BY depto, secao ORDER BY val DESC LIMIT ?';
  EXECUTE stmt USING @limit_val;
  DEALLOCATE PREPARE stmt;

  -- byGrupo
  PREPARE stmt FROM 'SELECT depto, secao, grupo AS name, SUM(v) AS val
    FROM tmp_period WHERE grupo IS NOT NULL
    GROUP BY depto, secao, grupo ORDER BY val DESC LIMIT ?';
  EXECUTE stmt USING @limit_val;
  DEALLOCATE PREPARE stmt;

  -- bySubgrupo
  PREPARE stmt FROM 'SELECT depto, secao, grupo, subgrupo AS name, SUM(v) AS val
    FROM tmp_period WHERE subgrupo IS NOT NULL
    GROUP BY depto, secao, grupo, subgrupo ORDER BY val DESC LIMIT ?';
  EXECUTE stmt USING @limit_val;
  DEALLOCATE PREPARE stmt;

  -- byProduto
  PREPARE stmt FROM 'SELECT prod_code AS code, MAX(prod_name) AS name, SUM(v) AS val
    FROM tmp_period
    GROUP BY prod_code ORDER BY val DESC LIMIT ?';
  EXECUTE stmt USING @limit_val;
  DEALLOCATE PREPARE stmt;

  DROP TEMPORARY TABLE IF EXISTS tmp_period;
  DROP TEMPORARY TABLE IF EXISTS tmp_filters;
END//

-- 3/20: filter_options (uses filter_hierarchy, 21k rows instead of 942k)
CREATE PROCEDURE filter_options(
  p_date_from DATE,
  p_date_to DATE,
  p_stores JSON,
  p_deptos JSON,
  p_secoes JSON,
  p_grupos JSON
)
BEGIN
  DECLARE v_has_store, v_has_depto, v_has_secao, v_has_grupo INT DEFAULT 0;

  DROP TEMPORARY TABLE IF EXISTS tmp_filters;
  CREATE TEMPORARY TABLE tmp_filters (
    store_code VARCHAR(20),
    depto VARCHAR(100),
    secao VARCHAR(100),
    grupo VARCHAR(100)
  ) ENGINE=MEMORY DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

  IF JSON_LENGTH(p_stores) > 0 THEN
    INSERT INTO tmp_filters (store_code)
    SELECT DISTINCT value FROM JSON_TABLE(p_stores, '$[*]' COLUMNS (value VARCHAR(20) PATH '$')) AS j;
  END IF;
  IF JSON_LENGTH(p_deptos) > 0 THEN
    INSERT INTO tmp_filters (depto)
    SELECT DISTINCT value FROM JSON_TABLE(p_deptos, '$[*]' COLUMNS (value VARCHAR(100) PATH '$')) AS j;
  END IF;
  IF JSON_LENGTH(p_secoes) > 0 THEN
    INSERT INTO tmp_filters (secao)
    SELECT DISTINCT value FROM JSON_TABLE(p_secoes, '$[*]' COLUMNS (value VARCHAR(100) PATH '$')) AS j;
  END IF;
  IF JSON_LENGTH(p_grupos) > 0 THEN
    INSERT INTO tmp_filters (grupo)
    SELECT DISTINCT value FROM JSON_TABLE(p_grupos, '$[*]' COLUMNS (value VARCHAR(100) PATH '$')) AS j;
  END IF;

  SELECT
    IFNULL(MAX(store_code IS NOT NULL), 0),
    IFNULL(MAX(depto IS NOT NULL), 0),
    IFNULL(MAX(secao IS NOT NULL), 0),
    IFNULL(MAX(grupo IS NOT NULL), 0)
  INTO v_has_store, v_has_depto, v_has_secao, v_has_grupo
  FROM tmp_filters;

  SELECT MAX(sale_date) AS latest_date FROM import_log;

  -- All queries use filter_hierarchy (21k rows): no date filtering on options
  --
  -- Cascade only top-down (Store > Departamento > Seção > Grupo >
  -- Subgrupo), never the other way around: each level filters only by the
  -- levels ABOVE it, never the ones below. Before this, a lower level
  -- (e.g. Grupo) also narrowed the options of a higher level (e.g.
  -- Departamento) -- which seemed harmless, but collapsed `opts.deptos`
  -- into its own already-selected subset and fired a false allSelected in
  -- MultiSelect (the filter turned into "All" on its own without the user
  -- ever clicking "Select all", see src/components/multi-select.tsx). Area
  -- had always followed this same rule (computeAreaCascadeOptions in
  -- src/lib/filter-cascade.ts), which is why it never had this bug.
  --
  -- Stores: root of the cascade, filters by nothing.
  SELECT DISTINCT f.store_code, COALESCE(s.store_name, f.store_code) AS store_name
  FROM filter_hierarchy f
  LEFT JOIN stores s ON s.store_code = f.store_code
  ORDER BY f.store_code;

  -- Deptos: filters only by store (the one level above it).
  SELECT DISTINCT f.depto
  FROM filter_hierarchy f
  WHERE f.depto IS NOT NULL
    AND (v_has_store = 0 OR f.store_code IN (SELECT t.store_code FROM tmp_filters t WHERE t.store_code IS NOT NULL))
  ORDER BY f.depto;

  -- Secoes: filters by store/depto (the levels above it).
  SELECT DISTINCT f.secao
  FROM filter_hierarchy f
  WHERE f.secao IS NOT NULL
    AND (v_has_store = 0 OR f.store_code IN (SELECT t.store_code FROM tmp_filters t WHERE t.store_code IS NOT NULL))
    AND (v_has_depto = 0 OR f.depto IN (SELECT t.depto FROM tmp_filters t WHERE t.depto IS NOT NULL))
  ORDER BY f.secao;

  -- Grupos: filter by store/depto/secao selections
  SELECT DISTINCT f.grupo
  FROM filter_hierarchy f
  WHERE f.grupo IS NOT NULL
    AND (v_has_store = 0 OR f.store_code IN (SELECT t.store_code FROM tmp_filters t WHERE t.store_code IS NOT NULL))
    AND (v_has_depto = 0 OR f.depto IN (SELECT t.depto FROM tmp_filters t WHERE t.depto IS NOT NULL))
    AND (v_has_secao = 0 OR f.secao IN (SELECT t.secao FROM tmp_filters t WHERE t.secao IS NOT NULL))
  ORDER BY f.grupo;

  -- Subgrupos: filter by all higher-level selections
  SELECT DISTINCT f.subgrupo
  FROM filter_hierarchy f
  WHERE f.subgrupo IS NOT NULL
    AND (v_has_store = 0 OR f.store_code IN (SELECT t.store_code FROM tmp_filters t WHERE t.store_code IS NOT NULL))
    AND (v_has_depto = 0 OR f.depto IN (SELECT t.depto FROM tmp_filters t WHERE t.depto IS NOT NULL))
    AND (v_has_secao = 0 OR f.secao IN (SELECT t.secao FROM tmp_filters t WHERE t.secao IS NOT NULL))
    AND (v_has_grupo = 0 OR f.grupo IN (SELECT t.grupo FROM tmp_filters t WHERE t.grupo IS NOT NULL))
  ORDER BY f.subgrupo;

  SELECT DISTINCT sale_date FROM import_log ORDER BY sale_date ASC;

  DROP TEMPORARY TABLE IF EXISTS tmp_filters;
END//

-- 4/20: area_analysis
--
-- Do NOT rewrite this proc into the "one scan + temp table" model without
-- measuring the entire proc. It's been tried before (PR #9) and REGRESSED
-- in production: 23.0s -> 30.6s on the 28-day window, reverted in the next
-- PR. The experiment that approved the change replicated the query without
-- the five NOT EXISTS/OR filter predicates: they're cheap in a derived
-- subquery and expensive as a condition on a
-- CREATE TEMPORARY TABLE ... AS SELECT. See docs/medicao-performance.md.
--
-- The same model WORKED in dashboard_metrics (46.3s -> 10.1s) and
-- dashboard_rankings (32.4s -> 19.0s), which don't do the LEFT JOIN
-- against product_universe. That's where the difference lies, not in the idea.
CREATE PROCEDURE area_analysis_v2(
  p_date_from DATE,
  p_date_to DATE,
  p_stores JSON,
  p_deptos JSON,
  p_secoes JSON,
  p_grupos JSON,
  p_subgrupos JSON,
  p_products JSON,
  p_page INT,
  p_page_size INT,
  p_search VARCHAR(255),
  p_sort_by VARCHAR(50),
  p_sort_dir VARCHAR(10)
)
BEGIN
  DECLARE v_offset INT DEFAULT 0;
  DECLARE v_limit INT DEFAULT 20;
  DECLARE v_total DECIMAL(18,2) DEFAULT 0;
  DECLARE v_with_sale INT DEFAULT 0;
  DECLARE v_universe INT DEFAULT 0;
  DECLARE v_total_products INT DEFAULT 0;

  DROP TEMPORARY TABLE IF EXISTS tmp_filters;
  CREATE TEMPORARY TABLE tmp_filters (
    store_code VARCHAR(20),
    depto VARCHAR(100),
    secao VARCHAR(100),
    grupo VARCHAR(100),
    subgrupo VARCHAR(100),
    prod_code VARCHAR(20)
  ) ENGINE=MEMORY DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

  IF JSON_LENGTH(p_stores) > 0 THEN
    INSERT INTO tmp_filters (store_code) SELECT DISTINCT value FROM JSON_TABLE(p_stores, '$[*]' COLUMNS (value VARCHAR(20) PATH '$')) AS j;
  END IF;
  IF JSON_LENGTH(p_deptos) > 0 THEN
    INSERT INTO tmp_filters (depto) SELECT DISTINCT value FROM JSON_TABLE(p_deptos, '$[*]' COLUMNS (value VARCHAR(100) PATH '$')) AS j;
  END IF;
  IF JSON_LENGTH(p_secoes) > 0 THEN
    INSERT INTO tmp_filters (secao) SELECT DISTINCT value FROM JSON_TABLE(p_secoes, '$[*]' COLUMNS (value VARCHAR(100) PATH '$')) AS j;
  END IF;
  IF JSON_LENGTH(p_grupos) > 0 THEN
    INSERT INTO tmp_filters (grupo) SELECT DISTINCT value FROM JSON_TABLE(p_grupos, '$[*]' COLUMNS (value VARCHAR(100) PATH '$')) AS j;
  END IF;
  IF JSON_LENGTH(p_subgrupos) > 0 THEN
    INSERT INTO tmp_filters (subgrupo) SELECT DISTINCT value FROM JSON_TABLE(p_subgrupos, '$[*]' COLUMNS (value VARCHAR(100) PATH '$')) AS j;
  END IF;
  IF JSON_LENGTH(p_products) > 0 THEN
    INSERT INTO tmp_filters (prod_code) SELECT DISTINCT value FROM JSON_TABLE(p_products, '$[*]' COLUMNS (value VARCHAR(20) PATH '$')) AS j;
  END IF;

  -- One source of truth for the selected current hierarchy. Historical sales
  -- join by store + PLU instead of reapplying the category recorded on each
  -- sale, so a reclassified product cannot contribute to one area while being
  -- listed in another.
  DROP TEMPORARY TABLE IF EXISTS tmp_area_scope;
  CREATE TEMPORARY TABLE tmp_area_scope (
    prod_code VARCHAR(20) NOT NULL,
    store_code VARCHAR(20) NOT NULL,
    PRIMARY KEY (prod_code, store_code),
    KEY idx_tmp_area_scope_store_prod (store_code, prod_code)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

  INSERT INTO tmp_area_scope (prod_code, store_code)
  SELECT u.prod_code, u.store_code
  FROM product_universe u
  WHERE (NOT EXISTS (SELECT 1 FROM tmp_filters t WHERE t.store_code IS NOT NULL) OR u.store_code IN (SELECT t.store_code FROM tmp_filters t WHERE t.store_code IS NOT NULL))
    AND (NOT EXISTS (SELECT 1 FROM tmp_filters t WHERE t.depto IS NOT NULL) OR u.depto IN (SELECT t.depto FROM tmp_filters t WHERE t.depto IS NOT NULL))
    AND (NOT EXISTS (SELECT 1 FROM tmp_filters t WHERE t.secao IS NOT NULL) OR u.secao IN (SELECT t.secao FROM tmp_filters t WHERE t.secao IS NOT NULL))
    AND (NOT EXISTS (SELECT 1 FROM tmp_filters t WHERE t.grupo IS NOT NULL) OR u.grupo IN (SELECT t.grupo FROM tmp_filters t WHERE t.grupo IS NOT NULL))
    AND (NOT EXISTS (SELECT 1 FROM tmp_filters t WHERE t.subgrupo IS NOT NULL) OR u.subgrupo IN (SELECT t.subgrupo FROM tmp_filters t WHERE t.subgrupo IS NOT NULL))
    AND (NOT EXISTS (SELECT 1 FROM tmp_filters t WHERE t.prod_code IS NOT NULL) OR u.prod_code IN (SELECT t.prod_code FROM tmp_filters t WHERE t.prod_code IS NOT NULL));

  IF p_page IS NOT NULL AND p_page_size IS NOT NULL THEN
    SET v_offset = (p_page - 1) * p_page_size;
    SET v_limit = p_page_size;
  END IF;

  -- Result set 1: aggregate KPIs
  --
  -- Sale and "PLUs with a sale" come from the PERIOD; the universe comes
  -- from product_universe, which has no date filtering: it's every PLU
  -- that has already sold within retention, under the same store/category
  -- filters.
  --
  -- The three counts used to come from the same period scan, and since the
  -- parser discards zero-value rows (xlsx-parser.ts), there was never a
  -- row with val_vda = 0: "PLUs without a sale" always came out 0 and
  -- "PLUs (area)" repeated "PLUs with a sale". Measured in prod: 339,007
  -- rows in the period, ZERO with val_vda <= 0.
  SELECT COALESCE(SUM(a.val_vda), 0), COUNT(DISTINCT a.prod_code)
    INTO v_total, v_with_sale
  FROM sales_prod_daily_agg a
  INNER JOIN tmp_area_scope scope ON scope.prod_code = a.prod_code AND scope.store_code = a.store_code
  WHERE (p_date_from IS NULL OR a.sale_date >= p_date_from)
    AND (p_date_to IS NULL OR a.sale_date <= p_date_to);

  SELECT COUNT(DISTINCT prod_code) INTO v_universe FROM tmp_area_scope;

  -- GREATEST still guards an out-of-date product_universe if an import wrote
  -- aggregates but the daily universe refresh has not completed yet.
  SELECT
    v_total                                  AS total,
    GREATEST(v_universe, v_with_sale)        AS plus_total,
    v_with_sale                              AS plus_with_sale,
    GREATEST(v_universe - v_with_sale, 0)    AS plus_without_sale;

  -- Result set 2: total count for pagination
  -- Counts the same set the listing (result set 4) returns: the universe
  -- under the filters, not just who sold in the period. If it counted the
  -- period, pagination would promise fewer pages than the list actually has.
  IF p_search IS NOT NULL AND p_search != '' THEN
    SELECT COUNT(DISTINCT u.prod_code) INTO v_total_products
    FROM product_universe u
    INNER JOIN tmp_area_scope scope ON scope.prod_code = u.prod_code AND scope.store_code = u.store_code
    WHERE u.prod_name LIKE CONCAT('%', p_search, '%') OR u.prod_code LIKE CONCAT('%', p_search, '%');
  ELSE
    SET v_total_products = v_universe;
  END IF;
  SELECT v_total_products AS total_products;

  -- Result set 3: byDate evolution
  SELECT a.sale_date AS date, SUM(a.val_vda) AS val
  FROM sales_prod_daily_agg a
  INNER JOIN tmp_area_scope scope ON scope.prod_code = a.prod_code AND scope.store_code = a.store_code
  WHERE (p_date_from IS NULL OR a.sale_date >= p_date_from)
    AND (p_date_to IS NULL OR a.sale_date <= p_date_to)
  GROUP BY a.sale_date ORDER BY a.sale_date;

  -- Result set 4: paginated products
  --
  -- The listing starts from the UNIVERSE (product_universe) and brings in
  -- the period's sales via LEFT JOIN, so a PLU with no sale in the slice
  -- shows up, with val = 0. That's what the UI always expected:
  -- area-table.tsx paints the row with `p.val === 0` yellow and the legend
  -- promises "products without a sale in the period". While the list came
  -- directly from sales_prod_daily_agg, this row was impossible: the
  -- parser discards zero values, so only whoever sold got in.
  --
  -- It's also cheaper as a bonus: aggregating over product_universe (~176k
  -- rows) and joining the already-aggregated period measures 0.8s against
  -- 2.8s for the previous version.
  --
  -- And it fixes a silent duplication: the old GROUP BY included name and
  -- category from the agg, so a PLU reclassified mid-period turned into
  -- two rows (13,608 groups for 13,595 distinct PLUs in prod). Here the
  -- classification is a single one, from the last sale.

  -- Ordering via whitelist. Unlike the dates and the search, which travel
  -- as PREPARE placeholders, the ORDER BY column can't be parameterized:
  -- it IS query structure, so it goes in concatenated. p_sort_by's value
  -- used to go straight into CONCAT: any text that arrived turned into SQL.
  --
  -- The TypeScript boundary already restricts it to a Zod enum
  -- (AreaAnalysisSchema), which is why there's never been any exploit
  -- possible through the application. But the proc is callable by any
  -- database client (CLI, console, a future integration) and can't depend
  -- on the caller having validated it beforehand.
  --
  -- The four values are what the application actually sends: three come
  -- from the enum and `last_sale_date` is the translation of "daysSince"
  -- done in area.functions.ts (sorting by "days without a sale" is sorting
  -- by last sale, inverted). Anything else falls to the default instead of
  -- failing: a listing sorted by sale is a better response to an invalid
  -- parameter than a 500 error.
  SET @sort_col = CASE p_sort_by
    WHEN 'val' THEN 'val'
    WHEN 'prod_code' THEN 'prod_code'
    WHEN 'prod_name' THEN 'prod_name'
    WHEN 'last_sale_date' THEN 'last_sale_date'
    ELSE 'val'
  END;
  SET @sort_dir = IF(p_sort_dir = 'asc' OR p_sort_dir = 'ASC', 'ASC', 'DESC');

  SET @sql = CONCAT(
     'SELECT u.prod_code, u.prod_name, u.depto, u.secao, u.grupo, u.subgrupo,
             COALESCE(s.val, 0) AS val,
             COALESCE(
               s.last_in_period,
               IF(
                 ? IS NULL OR u.last_sale_date <= ?,
                 u.last_sale_date,
                 (SELECT MAX(a2.sale_date)
                  FROM sales_prod_daily_agg a2
                  INNER JOIN tmp_area_scope scope2
                    ON scope2.prod_code = a2.prod_code AND scope2.store_code = a2.store_code
                  WHERE a2.prod_code = u.prod_code AND a2.sale_date <= ?)
               )
             ) AS last_sale_date
      FROM (
        SELECT uu.prod_code,
               MAX(uu.prod_name) AS prod_name, MAX(uu.depto) AS depto,
               MAX(uu.secao) AS secao, MAX(uu.grupo) AS grupo,
               MAX(uu.subgrupo) AS subgrupo, MAX(uu.last_sale_date) AS last_sale_date
        FROM product_universe uu
        INNER JOIN tmp_area_scope scope ON scope.prod_code = uu.prod_code AND scope.store_code = uu.store_code
        WHERE 1 = 1',
    IF(p_search IS NOT NULL AND p_search != '',
      ' AND (uu.prod_name LIKE ? OR uu.prod_code LIKE ?)', ''),
    '   GROUP BY uu.prod_code
      ) u
      LEFT JOIN (
        SELECT a.prod_code, SUM(a.val_vda) AS val,
               MAX(a.sale_date) AS last_in_period
        FROM sales_prod_daily_agg a
        INNER JOIN tmp_area_scope scope ON scope.prod_code = a.prod_code AND scope.store_code = a.store_code
        WHERE (? IS NULL OR a.sale_date >= ?)
          AND (? IS NULL OR a.sale_date <= ?)
        GROUP BY a.prod_code
      ) s ON s.prod_code = u.prod_code',
    CONCAT(' ORDER BY ', @sort_col, ' ', @sort_dir, ', prod_code ASC'),
    IF(v_limit > 0, CONCAT(' LIMIT ', v_limit), ''),
    IF(v_offset > 0, CONCAT(' OFFSET ', v_offset), '')
  );

  -- Placeholder order: the last-sale expression precedes both subqueries,
  -- then the optional search precedes the period dates. The historical
  -- lookup only runs when product_universe's latest sale is after dateTo.
  IF p_search IS NOT NULL AND p_search != '' THEN
    SET @search_param = CONCAT('%', p_search, '%');
    PREPARE stmt FROM @sql;
    EXECUTE stmt USING p_date_to, p_date_to, p_date_to, @search_param, @search_param, p_date_from, p_date_from, p_date_to, p_date_to;
    DEALLOCATE PREPARE stmt;
  ELSE
    PREPARE stmt FROM @sql;
    EXECUTE stmt USING p_date_to, p_date_to, p_date_to, p_date_from, p_date_from, p_date_to, p_date_to;
    DEALLOCATE PREPARE stmt;
  END IF;

  DROP TEMPORARY TABLE IF EXISTS tmp_area_scope;
  DROP TEMPORARY TABLE IF EXISTS tmp_filters;
END//

-- Keep the previous signature valid while migrations run before the atomic
-- release swap. The new application calls area_analysis_v2 with products.
CREATE PROCEDURE area_analysis(
  p_date_from DATE,
  p_date_to DATE,
  p_stores JSON,
  p_deptos JSON,
  p_secoes JSON,
  p_grupos JSON,
  p_subgrupos JSON,
  p_page INT,
  p_page_size INT,
  p_search VARCHAR(255),
  p_sort_by VARCHAR(32),
  p_sort_dir VARCHAR(4)
)
BEGIN
  CALL area_analysis_v2(
    p_date_from, p_date_to, p_stores, p_deptos, p_secoes, p_grupos,
    p_subgrupos, JSON_ARRAY(), p_page, p_page_size, p_search, p_sort_by,
    p_sort_dir
  );
END//

-- 5/20: area_filter_hierarchy
CREATE PROCEDURE area_filter_hierarchy()
BEGIN
  SELECT MAX(sale_date) AS latest_date FROM import_log;

  SELECT store_code, store_name, depto, secao, grupo, subgrupo
  FROM filter_hierarchy
  ORDER BY store_code, depto, secao, grupo, subgrupo;

  SELECT DISTINCT sale_date FROM import_log ORDER BY sale_date ASC;
END//

-- 6/20: product_search
CREATE PROCEDURE product_search(p_q VARCHAR(255))
BEGIN
  SELECT DISTINCT prod_code, prod_name
  FROM products
  WHERE prod_name LIKE CONCAT('%', p_q, '%')
     OR prod_code LIKE CONCAT('%', p_q, '%')
  LIMIT 20;
END//

-- 7/20: get_product_by_code
CREATE PROCEDURE get_product_by_code(p_code VARCHAR(20))
BEGIN
  SELECT DISTINCT prod_code, prod_name
  FROM products
  WHERE prod_code = p_code
  LIMIT 1;
END//

-- 8/20: product_analysis
--
-- p_store_codes is JSON (an array of store codes), no longer a single
-- VARCHAR: supports comparing a specific subset of stores, not just "one
-- store" or "all". Empty array = all (same behavior as the old
-- p_store_code IS NULL). Unlike area_analysis's regression
-- (docs/medicao-performance.md): here the prod_code filter is already
-- highly selective (a product has a few dozen/hundred rows total in
-- sales_prod_daily_agg), so JSON_CONTAINS's cost is irrelevant: it isn't
-- the same pattern of a repeated predicate over an entire table with no
-- selective filter ahead of it.
CREATE PROCEDURE product_analysis(
  p_prod_code VARCHAR(20),
  p_store_codes JSON,
  p_ref_date DATE
)
BEGIN
  DECLARE v_ref_date DATE;

  SET v_ref_date = COALESCE(p_ref_date, (
    SELECT MAX(sale_date)
    FROM sales_prod_daily_agg
    WHERE prod_code = p_prod_code
      AND (JSON_LENGTH(p_store_codes) = 0 OR JSON_CONTAINS(p_store_codes, JSON_QUOTE(store_code)))
  ));

  -- Result set 1: current metadata under the same store scope as the metrics.
  -- If selected stores disagree on the hierarchy, all category fields are
  -- returned as NULL instead of silently showing one store's path as if it
  -- represented the whole selection.
  SELECT p.prod_code, p.prod_name,
         IF(COUNT(DISTINCT CONCAT_WS(CHAR(31), COALESCE(u.depto, ''), COALESCE(u.secao, ''), COALESCE(u.grupo, ''), COALESCE(u.subgrupo, ''))) = 1, MAX(u.depto), NULL) AS depto,
         IF(COUNT(DISTINCT CONCAT_WS(CHAR(31), COALESCE(u.depto, ''), COALESCE(u.secao, ''), COALESCE(u.grupo, ''), COALESCE(u.subgrupo, ''))) = 1, MAX(u.secao), NULL) AS secao,
         IF(COUNT(DISTINCT CONCAT_WS(CHAR(31), COALESCE(u.depto, ''), COALESCE(u.secao, ''), COALESCE(u.grupo, ''), COALESCE(u.subgrupo, ''))) = 1, MAX(u.grupo), NULL) AS grupo,
         IF(COUNT(DISTINCT CONCAT_WS(CHAR(31), COALESCE(u.depto, ''), COALESCE(u.secao, ''), COALESCE(u.grupo, ''), COALESCE(u.subgrupo, ''))) = 1, MAX(u.subgrupo), NULL) AS subgrupo
  FROM (
    SELECT prod_code, prod_name
    FROM products
    WHERE prod_code = p_prod_code
    ORDER BY sale_date DESC
    LIMIT 1
  ) p
  LEFT JOIN product_universe u ON u.prod_code = p.prod_code
    AND (JSON_LENGTH(p_store_codes) = 0 OR JSON_CONTAINS(p_store_codes, JSON_QUOTE(u.store_code)))
  GROUP BY p.prod_code, p.prod_name;

  -- Result set 2: refValue + refDate
  SELECT v_ref_date AS ref_date, COALESCE(SUM(val_vda), 0) AS ref_value
  FROM sales_prod_daily_agg
  WHERE prod_code = p_prod_code
    AND sale_date = v_ref_date
    AND (JSON_LENGTH(p_store_codes) = 0 OR JSON_CONTAINS(p_store_codes, JSON_QUOTE(store_code)));

  -- Result set 3: byStore, always ALL stores, no p_store_codes filtering.
  -- The client decides whether to show it and which codes to filter by
  -- (comparing a subset doesn't need another round-trip to the database).
  SELECT a.store_code AS code, COALESCE(s.store_name, a.store_code) AS name, SUM(a.val_vda) AS val
  FROM sales_prod_daily_agg a
  LEFT JOIN stores s ON s.store_code = a.store_code
  WHERE a.prod_code = p_prod_code
    AND a.sale_date = v_ref_date
  GROUP BY a.store_code, s.store_name
  ORDER BY val DESC;

  -- Result set 4: evolution (last 28 days)
  --
  -- INTERVAL 27, not 28: both ends are inclusive, so `ref - 27` through
  -- `ref` is 28 dates. With 28 it came out to 29, contradicting the screen
  -- and PDF's "last 28 days" label, and 28 here isn't just any round
  -- number, it's exactly 4 weeks, which matters because the analysis next
  -- to it compares the same day of the week. With 29 days the window
  -- picked up a repeated weekday.
  SELECT a.sale_date AS date, SUM(a.val_vda) AS val
  FROM sales_prod_daily_agg a
  WHERE a.prod_code = p_prod_code
    AND a.sale_date >= DATE_SUB(v_ref_date, INTERVAL 27 DAY)
    AND a.sale_date <= v_ref_date
    AND (JSON_LENGTH(p_store_codes) = 0 OR JSON_CONTAINS(p_store_codes, JSON_QUOTE(a.store_code)))
  GROUP BY a.sale_date
  ORDER BY a.sale_date;

  -- Result set 5: lastFourSameWeekday
  SELECT a.sale_date AS date, SUM(a.val_vda) AS val
  FROM sales_prod_daily_agg a
  WHERE a.prod_code = p_prod_code
    AND DAYOFWEEK(a.sale_date) = DAYOFWEEK(v_ref_date)
    AND a.sale_date < v_ref_date
    AND (JSON_LENGTH(p_store_codes) = 0 OR JSON_CONTAINS(p_store_codes, JSON_QUOTE(a.store_code)))
  GROUP BY a.sale_date
  ORDER BY a.sale_date DESC
  LIMIT 4;

  -- Result set 6: lastFourAll
  SELECT a.sale_date AS date, SUM(a.val_vda) AS val
  FROM sales_prod_daily_agg a
  WHERE a.prod_code = p_prod_code
    AND a.sale_date < v_ref_date
    AND (JSON_LENGTH(p_store_codes) = 0 OR JSON_CONTAINS(p_store_codes, JSON_QUOTE(a.store_code)))
  GROUP BY a.sale_date
  ORDER BY a.sale_date DESC
  LIMIT 4;
END//

-- 9/20: upsert_products_bulk
CREATE PROCEDURE upsert_products_bulk(
  p_rows JSON,
  p_sale_date DATE
)
BEGIN
  DECLARE v_idx INT DEFAULT 0;
  DECLARE v_total INT;
  DECLARE v_prod_code VARCHAR(20);
  DECLARE v_prod_name VARCHAR(255);

  DROP TEMPORARY TABLE IF EXISTS tmp_products;
  CREATE TEMPORARY TABLE tmp_products (
    prod_code VARCHAR(20),
    prod_name VARCHAR(255)
  ) ENGINE=MEMORY DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

  INSERT INTO tmp_products (prod_code, prod_name)
  SELECT j.prod_code, j.prod_name
  FROM JSON_TABLE(p_rows, '$[*]' COLUMNS (
    prod_code VARCHAR(20) PATH '$.prod_code',
    prod_name VARCHAR(255) PATH '$.prod_name'
  )) AS j;

  INSERT IGNORE INTO products (prod_code, prod_name, sale_date)
  SELECT DISTINCT t.prod_code, t.prod_name, p_sale_date
  FROM tmp_products t;

  DROP TEMPORARY TABLE IF EXISTS tmp_products;
END//

-- 10/20: acquire_import_lock
CREATE PROCEDURE acquire_import_lock(
  p_batch_id VARCHAR(36),
  p_sale_date DATE,
  p_user_id VARCHAR(36),
  p_stores JSON,
  p_products JSON
)
BEGIN
  DECLARE v_batch_id VARCHAR(36) DEFAULT NULL;
  DECLARE v_expires_at DATETIME(3) DEFAULT NULL;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    RESIGNAL;
  END;

  START TRANSACTION;

  INSERT IGNORE INTO import_locks (lock_name) VALUES ('sales_import');
  SELECT batch_id, expires_at
    INTO v_batch_id, v_expires_at
    FROM import_locks
    WHERE lock_name = 'sales_import'
    FOR UPDATE;

  IF v_batch_id IS NOT NULL AND v_expires_at > CURRENT_TIMESTAMP(3) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'IMPORT_IN_PROGRESS';
  END IF;

  -- With no active owner, every staging row is stale. Clearing all dates
  -- prevents abandoned batches from accumulating indefinitely.
  DELETE FROM staging_sales;

  UPDATE import_locks
  SET batch_id = p_batch_id,
      sale_date = p_sale_date,
      user_id = p_user_id,
      stores_json = p_stores,
      products_json = p_products,
      acquired_at = CURRENT_TIMESTAMP(3),
      heartbeat_at = CURRENT_TIMESTAMP(3),
      expires_at = CURRENT_TIMESTAMP(3) + INTERVAL 10 MINUTE
  WHERE lock_name = 'sales_import';

  COMMIT;
END//

-- 11/20: renew_import_lock
CREATE PROCEDURE renew_import_lock(
  p_batch_id VARCHAR(36),
  p_sale_date DATE,
  p_user_id VARCHAR(36)
)
BEGIN
  UPDATE import_locks
  SET heartbeat_at = CURRENT_TIMESTAMP(3),
      expires_at = CURRENT_TIMESTAMP(3) + INTERVAL 10 MINUTE
  WHERE lock_name = 'sales_import'
    AND batch_id = p_batch_id
    AND sale_date = p_sale_date
    AND (user_id <=> p_user_id)
    AND expires_at > CURRENT_TIMESTAMP(3);

  IF ROW_COUNT() <> 1 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'IMPORT_LEASE_LOST';
  END IF;
END//

-- 12/20: release_import_lock
CREATE PROCEDURE release_import_lock(
  p_batch_id VARCHAR(36),
  p_user_id VARCHAR(36)
)
BEGIN
  DECLARE v_active_batch_id VARCHAR(36) DEFAULT NULL;
  DECLARE v_active_user_id VARCHAR(36) DEFAULT NULL;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    RESIGNAL;
  END;

  START TRANSACTION;
  SELECT batch_id, user_id
    INTO v_active_batch_id, v_active_user_id
    FROM import_locks
    WHERE lock_name = 'sales_import'
    FOR UPDATE;

  IF v_active_batch_id = p_batch_id AND (v_active_user_id <=> p_user_id) THEN
    DELETE FROM staging_sales WHERE batch_id = p_batch_id;
    UPDATE import_locks
    SET batch_id = NULL,
        sale_date = NULL,
        user_id = NULL,
        stores_json = NULL,
        products_json = NULL,
        acquired_at = NULL,
        heartbeat_at = NULL,
        expires_at = NULL
    WHERE lock_name = 'sales_import';
  END IF;
  COMMIT;
END//

-- Refuses an existing date unless replacement was explicitly confirmed.
-- The original procedure remains available while an old app release may
-- still be serving during deployment; all current callers use this guard.
CREATE PROCEDURE acquire_import_lock_checked(
  p_batch_id VARCHAR(36),
  p_sale_date DATE,
  p_user_id VARCHAR(36),
  p_stores JSON,
  p_products JSON,
  p_replace_existing BOOLEAN
)
BEGIN
  DECLARE v_acquired BOOLEAN DEFAULT FALSE;
  DECLARE v_date_exists BOOLEAN DEFAULT FALSE;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    IF v_acquired THEN
      CALL release_import_lock(p_batch_id, p_user_id);
    END IF;
    RESIGNAL;
  END;

  CALL acquire_import_lock(p_batch_id, p_sale_date, p_user_id, p_stores, p_products);
  SET v_acquired = TRUE;

  SELECT EXISTS(
    SELECT 1 FROM import_log WHERE sale_date = p_sale_date
  ) INTO v_date_exists;

  IF v_date_exists AND NOT COALESCE(p_replace_existing, FALSE) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'IMPORT_DATE_EXISTS';
  END IF;
END//

-- 13/20: finalize_import
CREATE PROCEDURE finalize_import(
  p_batch_id VARCHAR(36),
  p_sale_date DATE,
  p_row_count INT,
  p_imported_by VARCHAR(36)
)
BEGIN
  DECLARE v_staging_count INT DEFAULT 0;
  DECLARE v_active_batch_id VARCHAR(36) DEFAULT NULL;
  DECLARE v_active_sale_date DATE DEFAULT NULL;
  DECLARE v_active_user_id VARCHAR(36) DEFAULT NULL;
  DECLARE v_stores_json LONGTEXT DEFAULT NULL;
  DECLARE v_products_json LONGTEXT DEFAULT NULL;
  DECLARE v_expires_at DATETIME(3) DEFAULT NULL;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    RESIGNAL;
  END;

  START TRANSACTION;

  SELECT batch_id, sale_date, user_id, stores_json, products_json, expires_at
    INTO v_active_batch_id, v_active_sale_date, v_active_user_id, v_stores_json, v_products_json, v_expires_at
    FROM import_locks
    WHERE lock_name = 'sales_import'
    FOR UPDATE;

  IF v_active_batch_id IS NULL
     OR v_active_batch_id <> p_batch_id
     OR NOT (v_active_sale_date <=> p_sale_date)
     OR NOT (v_active_user_id <=> p_imported_by)
     OR v_expires_at IS NULL
     OR v_expires_at <= CURRENT_TIMESTAMP(3) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'IMPORT_LEASE_LOST';
  END IF;

  SELECT COUNT(*) INTO v_staging_count FROM staging_sales WHERE batch_id = p_batch_id AND sale_date = p_sale_date;
  IF p_row_count <= 0 OR v_staging_count <> p_row_count THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'IMPORT_ROW_COUNT_MISMATCH';
  END IF;

  INSERT INTO stores (store_code, store_name)
  SELECT j.store_code, MAX(j.store_name)
  FROM JSON_TABLE(COALESCE(v_stores_json, '[]'), '$[*]' COLUMNS (
    store_code VARCHAR(20) PATH '$.store_code',
    store_name VARCHAR(255) PATH '$.store_name'
  )) AS j
  GROUP BY j.store_code
  ON DUPLICATE KEY UPDATE store_name = VALUES(store_name);

  INSERT INTO products (prod_code, prod_name, sale_date)
  SELECT j.prod_code, MAX(j.prod_name), p_sale_date
  FROM JSON_TABLE(COALESCE(v_products_json, '[]'), '$[*]' COLUMNS (
    prod_code VARCHAR(20) PATH '$.prod_code',
    prod_name VARCHAR(255) PATH '$.prod_name'
  )) AS j
  GROUP BY j.prod_code
  ON DUPLICATE KEY UPDATE prod_name = VALUES(prod_name);

  DELETE FROM sales_daily_agg WHERE sale_date = p_sale_date;
  DELETE FROM sales_prod_daily_agg WHERE sale_date = p_sale_date;

  INSERT INTO sales_daily_agg (sale_date, store_code, val_vda)
  SELECT
    p_sale_date,
    s.store_code,
    COALESCE(SUM(s.val_vda), 0)
  FROM staging_sales s
  WHERE s.batch_id = p_batch_id AND s.sale_date = p_sale_date
  GROUP BY s.store_code;

  INSERT INTO sales_prod_daily_agg (sale_date, store_code, prod_code, prod_name, depto, secao, grupo, subgrupo, val_vda)
  SELECT
    p_sale_date,
    s.store_code,
    s.prod_code,
    MAX(s.prod_name),
    s.depto,
    s.secao,
    s.grupo,
    s.subgrupo,
    COALESCE(SUM(s.val_vda), 0)
  FROM staging_sales s
  WHERE s.batch_id = p_batch_id AND s.sale_date = p_sale_date
  GROUP BY s.store_code, s.prod_code, s.depto, s.secao, s.grupo, s.subgrupo;

  DELETE FROM staging_sales WHERE batch_id = p_batch_id AND sale_date = p_sale_date;

  -- Persist the measured count only after reconciling it with the expected
  -- count above. A missing chunk now rolls back before replacing aggregates.
  INSERT INTO import_log (sale_date, row_count, imported_by, batch_id)
  VALUES (p_sale_date, v_staging_count, p_imported_by, p_batch_id)
  ON DUPLICATE KEY UPDATE
    row_count = VALUES(row_count),
    imported_by = VALUES(imported_by),
    imported_at = CURRENT_TIMESTAMP,
    batch_id = VALUES(batch_id);

  UPDATE import_locks
  SET batch_id = NULL,
      sale_date = NULL,
      user_id = NULL,
      stores_json = NULL,
      products_json = NULL,
      acquired_at = NULL,
      heartbeat_at = NULL,
      expires_at = NULL
  WHERE lock_name = 'sales_import' AND batch_id = p_batch_id;

  -- Until 07/30/2026, this called
  -- refresh_filter_hierarchy()/refresh_product_universe() right here: every
  -- import paid ~30-36s for a full regeneration of both tables (they scan
  -- the entire sales_prod_daily_agg, not just the imported date; see the
  -- comment in those procs). docs/continuar.md item 5: new PLUs/categories
  -- are rare enough not to justify that synchronous cost on every import.
  -- Both now run in a daily cron (scripts/refresh-universe.ts, 03:30,
  -- after the 03:00 purge): a PLU sold for the first time today only shows
  -- up in Area after the next refresh, not the same day. Accepted
  -- consciously: see the full trade-off in the decision recorded in
  -- docs/continuar.md item 5.
  COMMIT;
END//

-- 14/20: imported_dates
CREATE PROCEDURE imported_dates()
BEGIN
  SELECT sale_date, row_count, imported_at
  FROM import_log
  ORDER BY sale_date DESC;
END//

-- 15/20: purge_old_aggs
--
-- The other end of the retention invariant; the JS side is in
-- src/lib/retention.ts (isWithinRetention), used by import-watch to avoid
-- importing what this purge would delete, otherwise it becomes a daily
-- import -> purge -> reimport loop.
--
-- The comparison is STRICT (`< @cutoff`), so the date exactly on the
-- boundary (p_days ago) is PRESERVED. The JS side uses `<=` precisely to
-- match this. Touch one, review the other.
--
-- TIMEZONE DEPENDENCY: the two sides only agree because the host and
-- MariaDB are both on UTC (`time_zone = SYSTEM`, host TZ `Etc/UTC`) --
-- that's what makes CURRENT_DATE the same day the JS computes in UTC.
-- Switching the timezone to America/Sao_Paulo makes CURRENT_DATE roll
-- over 3h before the UTC day and misaligns the boundary by a day.
CREATE PROCEDURE purge_old_aggs(p_days INT)
BEGIN
  DECLARE v_deleted INT DEFAULT 0;
  -- Without this until 07/31/2026, the 4 DELETEs below each autocommitted
  -- on their own (without START TRANSACTION, every isolated statement is
  -- already its own implicit transaction): a failure on the 3rd, for
  -- example, left the aggregates purged but products/import_log intact,
  -- with no rollback and v_deleted not reflecting what actually happened.
  -- Same pattern as finalize_import, which already had this protection.
  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    RESIGNAL;
  END;

  -- 180 is just a fallback: every real call (purgeOldAggs in
  -- admin-system.functions.ts, scripts/purge-aggs.ts) passes p_days
  -- explicitly from RETENTION_DAYS (src/lib/retention.ts). SQL doesn't
  -- import TS, so this literal only gets exercised by a manual call
  -- directly against the database, but if RETENTION_DAYS changes, change
  -- it here too, so the fallback doesn't drift from the value actually in use.
  SET @cutoff = DATE_SUB(CURRENT_DATE, INTERVAL COALESCE(p_days, 180) DAY);

  START TRANSACTION;

  DELETE FROM sales_daily_agg WHERE sale_date < @cutoff;
  SET v_deleted = v_deleted + ROW_COUNT();

  DELETE FROM sales_prod_daily_agg WHERE sale_date < @cutoff;
  SET v_deleted = v_deleted + ROW_COUNT();

  -- products was always missing here: the table was never purged by
  -- anything, it only received INSERT IGNORE on every import (~10.2k
  -- rows/day, no cap). It feeds product_search and get_product_by_code, so
  -- a PLU whose sales were purged kept showing up in search and opened a
  -- product page with no data at all.
  --
  -- Discovered on 2026-07-25, while manually purging dates before 05/27:
  -- products had to be deleted and filter_hierarchy regenerated outside
  -- this proc, precisely because it did neither. Product search now uses
  -- product_universe for its per-store scope; products still supports direct
  -- PLU links through getProductByCode.
  DELETE FROM products WHERE sale_date < @cutoff;
  SET v_deleted = v_deleted + ROW_COUNT();

  DELETE FROM import_log WHERE sale_date < @cutoff;
  SET v_deleted = v_deleted + ROW_COUNT();

  COMMIT;

  -- Until 07/30/2026, this called
  -- refresh_product_universe()/refresh_filter_hierarchy() here (gated on
  -- v_deleted > 0): both derived tables need to reflect the agg that just
  -- shrank, otherwise a PLU whose last sale got pruned never leaves the
  -- universe, and the filters keep offering combinations that no longer
  -- exist. This is now the dedicated cron's responsibility
  -- (scripts/refresh-universe.ts, 03:30: after the 03:00 purge, so it
  -- already sees the post-purge agg), not this proc's anymore. See
  -- docs/continuar.md item 5 and the equivalent comment in finalize_import.
  SELECT v_deleted AS deleted;
END//

-- 16/20: db_health_check
CREATE PROCEDURE db_health_check()
BEGIN
  SELECT VERSION() AS version, NOW() AS time;

  SELECT
    ROUND(SUM(data_length + index_length) / 1024 / 1024, 2) AS db_size_mb
  FROM information_schema.tables
  WHERE table_schema = DATABASE();

  SELECT
    table_name AS table_name,
    ROUND((data_length + index_length) / 1024 / 1024, 2) AS size_mb,
    table_rows AS row_estimate
  FROM information_schema.tables
  WHERE table_schema = DATABASE()
  ORDER BY size_mb DESC;
END//

-- 17/20: refresh_filter_hierarchy
--
-- Build the replacement in a temporary table before touching the published
-- table. DELETE and the final copy still share one transaction, so readers
-- see either the previous or the complete new version. Keeping the expensive
-- DISTINCT outside that transaction also prevents dashboard reads from
-- waiting behind the refresh for its full duration.
--
-- TRUNCATE is deliberately not used: it causes an implicit commit and a
-- concurrent reader can observe an empty table. See the atomicity note in
-- finalize_import and scripts/migrations/0015_stage_refresh_tables.sql.
CREATE PROCEDURE refresh_filter_hierarchy()
BEGIN
  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    DROP TEMPORARY TABLE IF EXISTS tmp_filter_hierarchy_refresh;
    RESIGNAL;
  END;

  DROP TEMPORARY TABLE IF EXISTS tmp_filter_hierarchy_refresh;
  CREATE TEMPORARY TABLE tmp_filter_hierarchy_refresh (
    store_code VARCHAR(20) NOT NULL,
    store_name VARCHAR(255) NOT NULL,
    depto VARCHAR(100),
    secao VARCHAR(100),
    grupo VARCHAR(100),
    subgrupo VARCHAR(100)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

  INSERT INTO tmp_filter_hierarchy_refresh
    (store_code, store_name, depto, secao, grupo, subgrupo)
  SELECT DISTINCT
    u.store_code,
    COALESCE(s.store_name, u.store_code),
    u.depto,
    u.secao,
    u.grupo,
    u.subgrupo
  FROM product_universe u
  LEFT JOIN stores s ON s.store_code = u.store_code
  WHERE u.depto IS NOT NULL OR u.secao IS NOT NULL OR u.grupo IS NOT NULL OR u.subgrupo IS NOT NULL;

  START TRANSACTION;

  DELETE FROM filter_hierarchy;

  INSERT INTO filter_hierarchy (store_code, store_name, depto, secao, grupo, subgrupo)
  SELECT store_code, store_name, depto, secao, grupo, subgrupo
  FROM tmp_filter_hierarchy_refresh;

  COMMIT;

  DROP TEMPORARY TABLE IF EXISTS tmp_filter_hierarchy_refresh;
END//

-- 18/20: refresh_product_universe
-- Regenerates product_universe from scratch (same pattern as
-- refresh_filter_hierarchy: the table is derived, so it's recreated, never
-- edited in place).
--
-- The JOIN with MAX(sale_date) per (prod_code, store_code) serves two
-- purposes at once: `a.sale_date` already IS the last sale, and
-- name/category come from the most recent row: a reclassified PLU ends up
-- with its current category, not the first one it had. Since the agg's PK
-- is (sale_date, store_code, prod_code), the JOIN returns exactly one row
-- per pair.
--
-- The expensive aggregation is staged before the transaction for the same
-- reason as refresh_filter_hierarchy. The short DELETE + copy transaction
-- preserves the old-version visibility guarantee for area_analysis and the
-- dashboard procedures without holding target-table locks during the scan.
CREATE PROCEDURE refresh_product_universe()
BEGIN
  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    DROP TEMPORARY TABLE IF EXISTS tmp_product_universe_refresh;
    RESIGNAL;
  END;

  DROP TEMPORARY TABLE IF EXISTS tmp_product_universe_refresh;
  CREATE TEMPORARY TABLE tmp_product_universe_refresh (
    prod_code VARCHAR(20) NOT NULL,
    store_code VARCHAR(20) NOT NULL,
    prod_name VARCHAR(255),
    depto VARCHAR(100),
    secao VARCHAR(100),
    grupo VARCHAR(100),
    subgrupo VARCHAR(100),
    last_sale_date DATE NOT NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

  INSERT INTO tmp_product_universe_refresh
    (prod_code, store_code, prod_name, depto, secao, grupo, subgrupo, last_sale_date)
  SELECT a.prod_code, a.store_code, a.prod_name, a.depto, a.secao, a.grupo, a.subgrupo, a.sale_date
  FROM sales_prod_daily_agg a
  JOIN (
    SELECT prod_code, store_code, MAX(sale_date) AS ult
    FROM sales_prod_daily_agg
    GROUP BY prod_code, store_code
  ) m
    ON m.prod_code = a.prod_code
   AND m.store_code = a.store_code
   AND m.ult = a.sale_date;

  START TRANSACTION;

  DELETE FROM product_universe;

  INSERT INTO product_universe
    (prod_code, store_code, prod_name, depto, secao, grupo, subgrupo, last_sale_date)
  SELECT prod_code, store_code, prod_name, depto, secao, grupo, subgrupo, last_sale_date
  FROM tmp_product_universe_refresh;

  COMMIT;

  DROP TEMPORARY TABLE IF EXISTS tmp_product_universe_refresh;
END//

-- 19/20: has_role
CREATE PROCEDURE has_role(p_user_id VARCHAR(36), p_role VARCHAR(20))
BEGIN
  SELECT COUNT(*) > 0 AS has_role
  FROM users
  WHERE id = p_user_id AND role = p_role AND is_active = TRUE;
END//

-- 20/20: production_forecast
--
-- See docs/planejamento-producao-perecveis-2026-08-07.md for the design.
-- Historical sales are joined by the product's current product_universe
-- classification. idx_prod_daily_store_prod_date supports that identity and
-- date-range access path; migration 0014 replaces the former historical
-- depto index, which cannot safely filter a reclassified product.
--
-- p_store_code/p_target_date are always required singles (not JSON like
-- area_analysis's optional multi-value filters): this screen always plans
-- for exactly one store and one future day.
--
-- p_secoes/p_grupos: JSON arrays, optional multi-value filters (added
-- 2026-08-08, measured as a v2 candidate: 178-229ms, no regression vs the
-- 229ms re-measured baseline, dispersion <1.3x on every trustworthy run
-- -- see docs/medicao-performance.md). Same tmp_filters/JSON_TABLE/
-- NOT EXISTS-OR-IN pattern as area_analysis, just 2 columns instead of 5
-- (no depto/subgrupo/store filter here: depto is fixed, store is always a
-- required single). Applying these as a condition on a
-- CREATE TEMPORARY TABLE ... AS SELECT is the exact shape that regressed
-- area_analysis (PR #9) -- but dashboard_metrics uses this same shape
-- successfully (46.3s -> 10.1s): the documented differentiator is
-- area_analysis's LEFT JOIN against product_universe inside the same
-- statement, which neither dashboard_metrics nor this proc has.
--
-- grupo/subgrupo added to result sets 1/2 (added 2026-08-08, measured as
-- a v3 candidate): the screen/PDF now group Seção -> Grupo -> Subgrupo
-- instead of just Seção, so "outros" (result set 2 at the time) had to
-- move from GROUP BY secao to GROUP BY secao, grupo, subgrupo -- a much
-- more granular aggregation. Measured: 281ms sem filtro (+58% vs the
-- 178ms v2 baseline, dispersion 1.12x), 226ms com filtro de seção
-- (~same as the 229ms v2 baseline, dispersion 1.16x).
--
-- p_min_occurrences and the whole "outros" result set removed (2026-08-09,
-- measured as a v4 candidate): the confidence-floor line ("Outros
-- produtos... poucas vendas no período") summarized every product below
-- the floor into one PLU-less bucket -- user feedback was that it carried
-- no actionable information. Every product with at least one sale in the
-- window is now its own row (min = avg = max for a single occurrence).
-- Measured: 278ms sem filtro (disp 1.25x) / 211ms com filtro de seção
-- (disp 1.05x, first attempt at 1.87x discarded) -- roughly flat vs the
-- v3 baseline, not the drop back to ~178ms expected from dropping an
-- entire GROUP BY: tmp_product_forecast (the scan+aggregate below) was
-- already the dominant cost, not the "outros" rollup on top of it -- see
-- docs/medicao-performance.md.
CREATE PROCEDURE production_forecast(
  p_store_code VARCHAR(20),
  p_target_date DATE,
  p_lookback_occurrences INT,
  p_secoes JSON,
  p_grupos JSON
)
BEGIN
  DECLARE v_window_start DATE;

  SET v_window_start = DATE_SUB(p_target_date, INTERVAL (p_lookback_occurrences * 7 - 1) DAY);

  DROP TEMPORARY TABLE IF EXISTS tmp_filters;
  CREATE TEMPORARY TABLE tmp_filters (
    secao VARCHAR(100),
    grupo VARCHAR(100)
  ) ENGINE=MEMORY DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

  IF JSON_LENGTH(p_secoes) > 0 THEN
    INSERT INTO tmp_filters (secao)
    SELECT DISTINCT value FROM JSON_TABLE(p_secoes, '$[*]' COLUMNS (value VARCHAR(100) PATH '$')) AS j;
  END IF;
  IF JSON_LENGTH(p_grupos) > 0 THEN
    INSERT INTO tmp_filters (grupo)
    SELECT DISTINCT value FROM JSON_TABLE(p_grupos, '$[*]' COLUMNS (value VARCHAR(100) PATH '$')) AS j;
  END IF;

  DROP TEMPORARY TABLE IF EXISTS tmp_product_forecast;
  CREATE TEMPORARY TABLE tmp_product_forecast ENGINE=InnoDB AS
  SELECT u.prod_code, u.prod_name, u.secao, u.grupo, u.subgrupo,
         COUNT(*) AS occurrences,
         AVG(a.val_vda) AS forecast_val, MIN(a.val_vda) AS forecast_min, MAX(a.val_vda) AS forecast_max
  FROM product_universe u
  INNER JOIN sales_prod_daily_agg a
    ON a.prod_code = u.prod_code AND a.store_code = u.store_code
  WHERE u.store_code = p_store_code
    AND u.depto = 'PERECIVEIS'
    AND a.sale_date >= v_window_start
    AND a.sale_date < p_target_date
    AND DAYOFWEEK(a.sale_date) = DAYOFWEEK(p_target_date)
    AND (NOT EXISTS (SELECT 1 FROM tmp_filters t WHERE t.secao IS NOT NULL) OR u.secao IN (SELECT t.secao FROM tmp_filters t WHERE t.secao IS NOT NULL))
    AND (NOT EXISTS (SELECT 1 FROM tmp_filters t WHERE t.grupo IS NOT NULL) OR u.grupo IN (SELECT t.grupo FROM tmp_filters t WHERE t.grupo IS NOT NULL))
  GROUP BY u.prod_code, u.prod_name, u.secao, u.grupo, u.subgrupo;

  -- Result set 1: every product with at least one occurrence in the
  -- window, no confidence floor, with the min/max range alongside the
  -- average -- mirrors GPA's own internal "Planejamento de Produção"
  -- report (QTD_MINIMA/IDEAL/MAXIMA), built from real sales history
  -- instead of imported as a separate feed (see
  -- docs/planejamento-producao-perecveis-2026-08-07.md). Also carries
  -- grupo/subgrupo so the screen/PDF can group by them, not just secao.
  SELECT prod_code, prod_name, secao, grupo, subgrupo, occurrences, forecast_val, forecast_min, forecast_max
  FROM tmp_product_forecast
  ORDER BY secao, grupo, subgrupo, forecast_val DESC;

  -- Result set 2: every section of PERECIVEIS at this store (from
  -- product_universe), respecting the secao/grupo filters -- an explicit
  -- user filter is different from the removed confidence floor: narrowing
  -- scope on purpose is not "hiding data without warning". Still just
  -- secao (unlike Result set 1): Grupo/Subgrupo only exist in the tree
  -- when they actually have data, unlike Seção which is always padded
  -- from the full catalog.
  SELECT DISTINCT secao
  FROM product_universe
  WHERE store_code = p_store_code AND depto = 'PERECIVEIS'
    AND (NOT EXISTS (SELECT 1 FROM tmp_filters t WHERE t.secao IS NOT NULL) OR secao IN (SELECT t.secao FROM tmp_filters t WHERE t.secao IS NOT NULL))
    AND (NOT EXISTS (SELECT 1 FROM tmp_filters t WHERE t.grupo IS NOT NULL) OR grupo IN (SELECT t.grupo FROM tmp_filters t WHERE t.grupo IS NOT NULL));

  SELECT DAYOFWEEK(p_target_date) AS weekday_num,
         p_lookback_occurrences AS lookback_occurrences;

  DROP TEMPORARY TABLE IF EXISTS tmp_product_forecast;
  DROP TEMPORARY TABLE IF EXISTS tmp_filters;
END//

DELIMITER ;
