-- =============================================
-- Bench GPA: Schema + Stored Procedures (MariaDB 11.4)
-- =============================================

DROP PROCEDURE IF EXISTS dashboard_metrics;
DROP PROCEDURE IF EXISTS dashboard_rankings;
DROP PROCEDURE IF EXISTS filter_options;
DROP PROCEDURE IF EXISTS area_analysis;
DROP PROCEDURE IF EXISTS area_filter_hierarchy;
DROP PROCEDURE IF EXISTS product_search;
DROP PROCEDURE IF EXISTS get_product_by_code;
DROP PROCEDURE IF EXISTS product_analysis;
DROP PROCEDURE IF EXISTS upsert_products_bulk;
DROP PROCEDURE IF EXISTS finalize_import;
DROP PROCEDURE IF EXISTS imported_dates;
DROP PROCEDURE IF EXISTS purge_old_aggs;
DROP PROCEDURE IF EXISTS db_health_check;
DROP PROCEDURE IF EXISTS refresh_filter_hierarchy;
DROP PROCEDURE IF EXISTS refresh_product_universe;
DROP PROCEDURE IF EXISTS has_role;

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

-- Deliberately no index on depto/secao/grupo/subgrupo: no analysis proc
-- benefits from them (filtering by any of them cost more than not
-- filtering, since the real access plan is always a scan by sale_date). The
-- 4 combined once took up 532.81 MB, 74.7% of the table's index. Removed in
-- production and measured on 2026-07-30 (see
-- scripts/migrations/0004_drop_indices_categoria_sales_prod_daily_agg.sql
-- and docs/medicao-performance.md): identical hash across the procs, no
-- read regression. Don't recreate without measuring again.
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

-- 1/16: dashboard_metrics
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
  ) ENGINE=MEMORY;

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
  SELECT a.sale_date, a.store_code, a.depto, SUM(a.val_vda) AS val
  FROM sales_prod_daily_agg a
  WHERE (p_date_from IS NULL OR a.sale_date >= p_date_from)
    AND (p_date_to IS NULL OR a.sale_date <= p_date_to)
    AND (NOT EXISTS (SELECT 1 FROM tmp_filters t WHERE t.store_code IS NOT NULL)
      OR a.store_code IN (SELECT t.store_code FROM tmp_filters t WHERE t.store_code IS NOT NULL))
    AND (NOT EXISTS (SELECT 1 FROM tmp_filters t WHERE t.depto IS NOT NULL)
      OR a.depto IN (SELECT t.depto FROM tmp_filters t WHERE t.depto IS NOT NULL))
    AND (NOT EXISTS (SELECT 1 FROM tmp_filters t WHERE t.secao IS NOT NULL)
      OR a.secao IN (SELECT t.secao FROM tmp_filters t WHERE t.secao IS NOT NULL))
    AND (NOT EXISTS (SELECT 1 FROM tmp_filters t WHERE t.grupo IS NOT NULL)
      OR a.grupo IN (SELECT t.grupo FROM tmp_filters t WHERE t.grupo IS NOT NULL))
    AND (NOT EXISTS (SELECT 1 FROM tmp_filters t WHERE t.subgrupo IS NOT NULL)
      OR a.subgrupo IN (SELECT t.subgrupo FROM tmp_filters t WHERE t.subgrupo IS NOT NULL))
  GROUP BY a.sale_date, a.store_code, a.depto;

  -- Result set 1: aggregates
  -- Only `total` is read (callMetrics, in src/lib/api-types.ts). This
  -- SELECT also used to compute total_plus/plus_with_sale/plus_without_sale,
  -- which TypeScript discarded: three COUNT(DISTINCT prod_code) over the
  -- filtered sales_prod_daily_agg window on every call, with no reader at
  -- all. The equivalent KPIs that actually exist live in area_analysis,
  -- which delivers them to the Área screen. Don't confuse the two.
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

-- 2/16: dashboard_rankings
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
  ) ENGINE=MEMORY;

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
  SELECT a.depto, a.secao, a.grupo, a.subgrupo, a.prod_code, a.prod_name,
         SUM(a.val_vda) AS v
  FROM sales_prod_daily_agg a
  WHERE (p_date_from IS NULL OR a.sale_date >= p_date_from)
    AND (p_date_to IS NULL OR a.sale_date <= p_date_to)
    AND (NOT EXISTS (SELECT 1 FROM tmp_filters t WHERE t.store_code IS NOT NULL) OR a.store_code IN (SELECT t.store_code FROM tmp_filters t WHERE t.store_code IS NOT NULL))
    AND (NOT EXISTS (SELECT 1 FROM tmp_filters t WHERE t.depto IS NOT NULL) OR a.depto IN (SELECT t.depto FROM tmp_filters t WHERE t.depto IS NOT NULL))
    AND (NOT EXISTS (SELECT 1 FROM tmp_filters t WHERE t.secao IS NOT NULL) OR a.secao IN (SELECT t.secao FROM tmp_filters t WHERE t.secao IS NOT NULL))
    AND (NOT EXISTS (SELECT 1 FROM tmp_filters t WHERE t.grupo IS NOT NULL) OR a.grupo IN (SELECT t.grupo FROM tmp_filters t WHERE t.grupo IS NOT NULL))
    AND (NOT EXISTS (SELECT 1 FROM tmp_filters t WHERE t.subgrupo IS NOT NULL) OR a.subgrupo IN (SELECT t.subgrupo FROM tmp_filters t WHERE t.subgrupo IS NOT NULL))
  GROUP BY a.depto, a.secao, a.grupo, a.subgrupo, a.prod_code, a.prod_name;

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
  PREPARE stmt FROM 'SELECT secao AS name, SUM(v) AS val
    FROM tmp_period WHERE secao IS NOT NULL
    GROUP BY secao ORDER BY val DESC LIMIT ?';
  EXECUTE stmt USING @limit_val;
  DEALLOCATE PREPARE stmt;

  -- byGrupo
  PREPARE stmt FROM 'SELECT grupo AS name, SUM(v) AS val
    FROM tmp_period WHERE grupo IS NOT NULL
    GROUP BY grupo ORDER BY val DESC LIMIT ?';
  EXECUTE stmt USING @limit_val;
  DEALLOCATE PREPARE stmt;

  -- bySubgrupo
  PREPARE stmt FROM 'SELECT subgrupo AS name, SUM(v) AS val
    FROM tmp_period WHERE subgrupo IS NOT NULL
    GROUP BY subgrupo ORDER BY val DESC LIMIT ?';
  EXECUTE stmt USING @limit_val;
  DEALLOCATE PREPARE stmt;

  -- byProduto
  PREPARE stmt FROM 'SELECT prod_code AS code, prod_name AS name, SUM(v) AS val
    FROM tmp_period
    GROUP BY prod_code, prod_name ORDER BY val DESC LIMIT ?';
  EXECUTE stmt USING @limit_val;
  DEALLOCATE PREPARE stmt;

  DROP TEMPORARY TABLE IF EXISTS tmp_period;
  DROP TEMPORARY TABLE IF EXISTS tmp_filters;
END//

-- 3/16: filter_options (uses filter_hierarchy, 21k rows instead of 942k)
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
  ) ENGINE=MEMORY;

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
  -- ever clicking "Select all", see src/components/multi-select.tsx). Área
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

-- 4/16: area_analysis
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
  p_sort_by VARCHAR(50),
  p_sort_dir VARCHAR(10)
)
BEGIN
  DECLARE v_offset INT DEFAULT 0;
  DECLARE v_limit INT DEFAULT 20;
  DECLARE v_total DECIMAL(18,2) DEFAULT 0;
  DECLARE v_with_sale INT DEFAULT 0;
  DECLARE v_universe INT DEFAULT 0;

  DROP TEMPORARY TABLE IF EXISTS tmp_filters;
  CREATE TEMPORARY TABLE tmp_filters (
    store_code VARCHAR(20),
    depto VARCHAR(100),
    secao VARCHAR(100),
    grupo VARCHAR(100),
    subgrupo VARCHAR(100)
  ) ENGINE=MEMORY;

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
  WHERE (p_date_from IS NULL OR a.sale_date >= p_date_from)
    AND (p_date_to IS NULL OR a.sale_date <= p_date_to)
    AND (NOT EXISTS (SELECT 1 FROM tmp_filters t WHERE t.store_code IS NOT NULL) OR a.store_code IN (SELECT t.store_code FROM tmp_filters t WHERE t.store_code IS NOT NULL))
    AND (NOT EXISTS (SELECT 1 FROM tmp_filters t WHERE t.depto IS NOT NULL) OR a.depto IN (SELECT t.depto FROM tmp_filters t WHERE t.depto IS NOT NULL))
    AND (NOT EXISTS (SELECT 1 FROM tmp_filters t WHERE t.secao IS NOT NULL) OR a.secao IN (SELECT t.secao FROM tmp_filters t WHERE t.secao IS NOT NULL))
    AND (NOT EXISTS (SELECT 1 FROM tmp_filters t WHERE t.grupo IS NOT NULL) OR a.grupo IN (SELECT t.grupo FROM tmp_filters t WHERE t.grupo IS NOT NULL))
    AND (NOT EXISTS (SELECT 1 FROM tmp_filters t WHERE t.subgrupo IS NOT NULL) OR a.subgrupo IN (SELECT t.subgrupo FROM tmp_filters t WHERE t.subgrupo IS NOT NULL));

  SELECT COUNT(DISTINCT u.prod_code) INTO v_universe
  FROM product_universe u
  WHERE (NOT EXISTS (SELECT 1 FROM tmp_filters t WHERE t.store_code IS NOT NULL) OR u.store_code IN (SELECT t.store_code FROM tmp_filters t WHERE t.store_code IS NOT NULL))
    AND (NOT EXISTS (SELECT 1 FROM tmp_filters t WHERE t.depto IS NOT NULL) OR u.depto IN (SELECT t.depto FROM tmp_filters t WHERE t.depto IS NOT NULL))
    AND (NOT EXISTS (SELECT 1 FROM tmp_filters t WHERE t.secao IS NOT NULL) OR u.secao IN (SELECT t.secao FROM tmp_filters t WHERE t.secao IS NOT NULL))
    AND (NOT EXISTS (SELECT 1 FROM tmp_filters t WHERE t.grupo IS NOT NULL) OR u.grupo IN (SELECT t.grupo FROM tmp_filters t WHERE t.grupo IS NOT NULL))
    AND (NOT EXISTS (SELECT 1 FROM tmp_filters t WHERE t.subgrupo IS NOT NULL) OR u.subgrupo IN (SELECT t.subgrupo FROM tmp_filters t WHERE t.subgrupo IS NOT NULL));

  -- GREATEST guards against two cases where the universe can momentarily be
  -- smaller than the period: an out-of-date product_universe (the import
  -- wrote the agg but the refresh failed) and a reclassified PLU: the
  -- universe keeps the category from the last sale, so under a category
  -- filter it can show up in the period but not the universe. Neither one
  -- can turn into a negative KPI.
  SELECT
    v_total                                  AS total,
    GREATEST(v_universe, v_with_sale)        AS plus_total,
    v_with_sale                              AS plus_with_sale,
    GREATEST(v_universe - v_with_sale, 0)    AS plus_without_sale;

  -- Result set 2: total count for pagination
  -- Counts the same set the listing (result set 4) returns: the universe
  -- under the filters, not just who sold in the period. If it counted the
  -- period, pagination would promise fewer pages than the list actually has.
  -- (As before, doesn't account for p_search: the search narrows the list
  -- but not this total. Pre-existing limitation, kept to avoid changing
  -- two things at once.)
  --
  -- v_universe (result set 1) is already exactly this count: same table,
  -- same WHERE, computed a few lines above. Reuses it instead of scanning
  -- product_universe again. Do NOT confuse this with the regression
  -- documented in docs/medicao-performance.md: that one touched
  -- sales_prod_daily_agg via CREATE TEMPORARY TABLE ... AS SELECT; this
  -- just reuses an already-computed variable, without changing the plan of
  -- any scan on the big table.
  SELECT v_universe AS total_products;

  -- Result set 3: byDate evolution
  SELECT a.sale_date AS date, SUM(a.val_vda) AS val
  FROM sales_prod_daily_agg a
  WHERE (p_date_from IS NULL OR a.sale_date >= p_date_from)
    AND (p_date_to IS NULL OR a.sale_date <= p_date_to)
    AND (NOT EXISTS (SELECT 1 FROM tmp_filters t WHERE t.store_code IS NOT NULL) OR a.store_code IN (SELECT t.store_code FROM tmp_filters t WHERE t.store_code IS NOT NULL))
    AND (NOT EXISTS (SELECT 1 FROM tmp_filters t WHERE t.depto IS NOT NULL) OR a.depto IN (SELECT t.depto FROM tmp_filters t WHERE t.depto IS NOT NULL))
    AND (NOT EXISTS (SELECT 1 FROM tmp_filters t WHERE t.secao IS NOT NULL) OR a.secao IN (SELECT t.secao FROM tmp_filters t WHERE t.secao IS NOT NULL))
    AND (NOT EXISTS (SELECT 1 FROM tmp_filters t WHERE t.grupo IS NOT NULL) OR a.grupo IN (SELECT t.grupo FROM tmp_filters t WHERE t.grupo IS NOT NULL))
    AND (NOT EXISTS (SELECT 1 FROM tmp_filters t WHERE t.subgrupo IS NOT NULL) OR a.subgrupo IN (SELECT t.subgrupo FROM tmp_filters t WHERE t.subgrupo IS NOT NULL))
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
             COALESCE(s.last_in_period, u.last_sale_date) AS last_sale_date
      FROM (
        SELECT uu.prod_code,
               MAX(uu.prod_name) AS prod_name, MAX(uu.depto) AS depto,
               MAX(uu.secao) AS secao, MAX(uu.grupo) AS grupo,
               MAX(uu.subgrupo) AS subgrupo, MAX(uu.last_sale_date) AS last_sale_date
        FROM product_universe uu
        WHERE (NOT EXISTS (SELECT 1 FROM tmp_filters t WHERE t.store_code IS NOT NULL) OR uu.store_code IN (SELECT t.store_code FROM tmp_filters t WHERE t.store_code IS NOT NULL))
          AND (NOT EXISTS (SELECT 1 FROM tmp_filters t WHERE t.depto IS NOT NULL) OR uu.depto IN (SELECT t.depto FROM tmp_filters t WHERE t.depto IS NOT NULL))
          AND (NOT EXISTS (SELECT 1 FROM tmp_filters t WHERE t.secao IS NOT NULL) OR uu.secao IN (SELECT t.secao FROM tmp_filters t WHERE t.secao IS NOT NULL))
          AND (NOT EXISTS (SELECT 1 FROM tmp_filters t WHERE t.grupo IS NOT NULL) OR uu.grupo IN (SELECT t.grupo FROM tmp_filters t WHERE t.grupo IS NOT NULL))
          AND (NOT EXISTS (SELECT 1 FROM tmp_filters t WHERE t.subgrupo IS NOT NULL) OR uu.subgrupo IN (SELECT t.subgrupo FROM tmp_filters t WHERE t.subgrupo IS NOT NULL))',
    IF(p_search IS NOT NULL AND p_search != '',
      ' AND (uu.prod_name LIKE ? OR uu.prod_code LIKE ?)', ''),
    '   GROUP BY uu.prod_code
      ) u
      LEFT JOIN (
        SELECT a.prod_code, SUM(a.val_vda) AS val,
               MAX(a.sale_date) AS last_in_period
        FROM sales_prod_daily_agg a
        WHERE (? IS NULL OR a.sale_date >= ?)
          AND (? IS NULL OR a.sale_date <= ?)
          AND (NOT EXISTS (SELECT 1 FROM tmp_filters t WHERE t.store_code IS NOT NULL) OR a.store_code IN (SELECT t.store_code FROM tmp_filters t WHERE t.store_code IS NOT NULL))
          AND (NOT EXISTS (SELECT 1 FROM tmp_filters t WHERE t.depto IS NOT NULL) OR a.depto IN (SELECT t.depto FROM tmp_filters t WHERE t.depto IS NOT NULL))
          AND (NOT EXISTS (SELECT 1 FROM tmp_filters t WHERE t.secao IS NOT NULL) OR a.secao IN (SELECT t.secao FROM tmp_filters t WHERE t.secao IS NOT NULL))
          AND (NOT EXISTS (SELECT 1 FROM tmp_filters t WHERE t.grupo IS NOT NULL) OR a.grupo IN (SELECT t.grupo FROM tmp_filters t WHERE t.grupo IS NOT NULL))
          AND (NOT EXISTS (SELECT 1 FROM tmp_filters t WHERE t.subgrupo IS NOT NULL) OR a.subgrupo IN (SELECT t.subgrupo FROM tmp_filters t WHERE t.subgrupo IS NOT NULL))
        GROUP BY a.prod_code
      ) s ON s.prod_code = u.prod_code',
    CONCAT(' ORDER BY ', @sort_col, ' ', @sort_dir),
    IF(v_limit > 0, CONCAT(' LIMIT ', v_limit), ''),
    IF(v_offset > 0, CONCAT(' OFFSET ', v_offset), '')
  );

  -- Placeholder order: the search filter now lives in the universe
  -- subquery, which comes BEFORE the period subquery, which is why
  -- @search_param precedes the dates here.
  IF p_search IS NOT NULL AND p_search != '' THEN
    SET @search_param = CONCAT('%', p_search, '%');
    PREPARE stmt FROM @sql;
    EXECUTE stmt USING @search_param, @search_param, p_date_from, p_date_from, p_date_to, p_date_to;
    DEALLOCATE PREPARE stmt;
  ELSE
    PREPARE stmt FROM @sql;
    EXECUTE stmt USING p_date_from, p_date_from, p_date_to, p_date_to;
    DEALLOCATE PREPARE stmt;
  END IF;

  DROP TEMPORARY TABLE IF EXISTS tmp_filters;
END//

-- 5/16: area_filter_hierarchy
CREATE PROCEDURE area_filter_hierarchy()
BEGIN
  SELECT MAX(sale_date) AS latest_date FROM import_log;

  SELECT store_code, store_name, depto, secao, grupo, subgrupo
  FROM filter_hierarchy
  ORDER BY store_code, depto, secao, grupo, subgrupo;

  SELECT DISTINCT sale_date FROM import_log ORDER BY sale_date ASC;
END//

-- 6/16: product_search
CREATE PROCEDURE product_search(p_q VARCHAR(255))
BEGIN
  SELECT DISTINCT prod_code, prod_name
  FROM products
  WHERE prod_name LIKE CONCAT('%', p_q, '%')
     OR prod_code LIKE CONCAT('%', p_q, '%')
  LIMIT 20;
END//

-- 7/16: get_product_by_code
CREATE PROCEDURE get_product_by_code(p_code VARCHAR(20))
BEGIN
  SELECT DISTINCT prod_code, prod_name
  FROM products
  WHERE prod_code = p_code
  LIMIT 1;
END//

-- 8/16: product_analysis
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

  SET v_ref_date = COALESCE(p_ref_date, (SELECT MAX(sale_date) FROM sales_prod_daily_agg WHERE prod_code = p_prod_code));

  -- Result set 1: product metadata (always returns row from products even without sales)
  SELECT p.prod_code, p.prod_name, h.depto, h.secao, h.grupo, h.subgrupo
  FROM products p
  LEFT JOIN (
    SELECT prod_code, depto, secao, grupo, subgrupo
    FROM sales_prod_daily_agg
    WHERE prod_code = p_prod_code
    ORDER BY sale_date DESC
    LIMIT 1
  ) h ON true
  WHERE p.prod_code = p_prod_code
  LIMIT 1;

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

-- 9/16: upsert_products_bulk
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
  ) ENGINE=MEMORY;

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

-- 10/16: finalize_import
CREATE PROCEDURE finalize_import(
  p_batch_id VARCHAR(36),
  p_sale_date DATE,
  p_row_count INT,
  p_imported_by VARCHAR(36)
)
BEGIN
  DECLARE v_staging_count INT DEFAULT 0;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    RESIGNAL;
  END;

  START TRANSACTION;

  SELECT COUNT(*) INTO v_staging_count FROM staging_sales WHERE batch_id = p_batch_id AND sale_date = p_sale_date;
  IF v_staging_count = 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'No staging rows found for given batch_id and sale_date';
  END IF;

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

  -- v_staging_count, not p_row_count: the value the client sends is only
  -- what it INTENDED to import (parsed.sales.length, computed before any
  -- chunk has actually been inserted): it's never cross-checked against
  -- what actually arrived in staging. A silently lost chunk would record
  -- the wrong number in import_log with zero detection (see
  -- docs/auditoria-qa-2026-08-01.md, item 8). v_staging_count was already
  -- counted and verified > 0 above in this same procedure: it's the only
  -- trustworthy source.
  INSERT INTO import_log (sale_date, row_count, imported_by, batch_id)
  VALUES (p_sale_date, v_staging_count, p_imported_by, p_batch_id)
  ON DUPLICATE KEY UPDATE
    row_count = VALUES(row_count),
    imported_by = VALUES(imported_by),
    imported_at = CURRENT_TIMESTAMP,
    batch_id = VALUES(batch_id);

  -- Until 07/30/2026, this called
  -- refresh_filter_hierarchy()/refresh_product_universe() right here: every
  -- import paid ~30-36s for a full regeneration of both tables (they scan
  -- the entire sales_prod_daily_agg, not just the imported date; see the
  -- comment in those procs). docs/continuar.md item 5: new PLUs/categories
  -- are rare enough not to justify that synchronous cost on every import.
  -- Both now run in a daily cron (scripts/refresh-universe.ts, 03:30,
  -- after the 03:00 purge): a PLU sold for the first time today only shows
  -- up in Área after the next refresh, not the same day. Accepted
  -- consciously: see the full trade-off in the decision recorded in
  -- docs/continuar.md item 5.
  COMMIT;
END//

-- 11/16: imported_dates
CREATE PROCEDURE imported_dates()
BEGIN
  SELECT sale_date, row_count, imported_at
  FROM import_log
  ORDER BY sale_date DESC;
END//

-- 12/16: purge_old_aggs
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
  -- this proc, precisely because it did neither.
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

-- 13/16: db_health_check
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

-- 14/16: refresh_filter_hierarchy
--
-- DELETE, not TRUNCATE. Both empty the table, but TRUNCATE is DDL: it
-- causes an implicit commit and doesn't respect MVCC. Measured on
-- 2026-07-25, with 164k rows in product_universe: during the refresh's
-- ~33s, a concurrent reader saw ZERO rows in the table, and the Área
-- screen starts from the universe, so it went empty on every import, right
-- in the middle of business hours (the cron runs 10am-10pm). With DELETE,
-- the reader keeps seeing the previous version until COMMIT.
--
-- DELETE's measured cost over TRUNCATE was +11% (32.8s -> 36.5s), which is
-- cheap for what it buys: besides visibility, DELETE is transactional, so
-- a failure mid-refresh rolls back to the previous state instead of
-- leaving the table truncated. See the atomicity note in finalize_import.
--
-- Fix on 07/31/2026: the guarantee above is only real with the DELETE and
-- the INSERT in the SAME transaction: without an explicit START
-- TRANSACTION, every statement is already its own implicit transaction
-- (autocommit) and the reader saw the table momentarily empty between the
-- two, exactly the symptom DELETE was supposed to avoid. It was harmless
-- while this proc was only called from inside finalize_import (which
-- already wrapped everything in a transaction); it stopped being true
-- once it became a standalone call from the dedicated cron
-- (scripts/refresh-universe.ts, docs/continuar.md item 5).
CREATE PROCEDURE refresh_filter_hierarchy()
BEGIN
  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    RESIGNAL;
  END;

  START TRANSACTION;

  DELETE FROM filter_hierarchy;

  INSERT INTO filter_hierarchy (store_code, store_name, depto, secao, grupo, subgrupo)
  SELECT DISTINCT
    a.store_code,
    COALESCE(s.store_name, a.store_code),
    a.depto,
    a.secao,
    a.grupo,
    a.subgrupo
  FROM sales_prod_daily_agg a
  LEFT JOIN stores s ON s.store_code = a.store_code
  WHERE a.depto IS NOT NULL OR a.secao IS NOT NULL OR a.grupo IS NOT NULL OR a.subgrupo IS NOT NULL;

  COMMIT;
END//

-- 15/16: refresh_product_universe
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
-- DELETE instead of TRUNCATE for the same reason as
-- refresh_filter_hierarchy: with TRUNCATE the table is visibly empty to
-- anyone reading during the refresh. Same 07/31/2026 fix documented there:
-- DELETE + INSERT need to be in the same transaction for the visibility
-- guarantee to actually hold, especially here: area_analysis does a LEFT
-- JOIN of the period over this table to decide which products exist.
CREATE PROCEDURE refresh_product_universe()
BEGIN
  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    RESIGNAL;
  END;

  START TRANSACTION;

  DELETE FROM product_universe;

  INSERT INTO product_universe
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

  COMMIT;
END//

-- 16/16: has_role
CREATE PROCEDURE has_role(p_user_id VARCHAR(36), p_role VARCHAR(20))
BEGIN
  SELECT COUNT(*) > 0 AS has_role
  FROM users
  WHERE id = p_user_id AND role = p_role AND is_active = TRUE;
END//

DELIMITER ;
