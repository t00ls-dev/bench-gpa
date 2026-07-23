-- =============================================
-- Bench GPA — Schema + Stored Procedures (MariaDB 11.4)
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

CREATE TABLE IF NOT EXISTS users (
  id         VARCHAR(36) PRIMARY KEY,
  email      VARCHAR(255) NOT NULL UNIQUE,
  name       VARCHAR(255) NOT NULL,
  password   VARCHAR(255) NOT NULL,
  role       ENUM('admin','user') NOT NULL DEFAULT 'user',
  is_active  BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_users_email (email),
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
  PRIMARY KEY (prod_code, sale_date),
  INDEX idx_products_prod_code (prod_code)
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
  qty_vda      DECIMAL(15,4) DEFAULT 0,
  val_cus      DECIMAL(15,2) DEFAULT 0,
  qty_cus      DECIMAL(15,4) DEFAULT 0,
  val_dev      DECIMAL(15,2) DEFAULT 0,
  qty_dev      DECIMAL(15,4) DEFAULT 0,
  val_vda_liq  DECIMAL(15,2) DEFAULT 0,
  qty_vda_liq  DECIMAL(15,4) DEFAULT 0,
  val_cus_liq  DECIMAL(15,2) DEFAULT 0,
  qty_cus_liq  DECIMAL(15,4) DEFAULT 0,
  val_sld      DECIMAL(15,2) DEFAULT 0,
  qty_sld      DECIMAL(15,4) DEFAULT 0,
  per_mrg      DECIMAL(7,2) DEFAULT 0,
  INDEX idx_staging_batch (batch_id),
  INDEX idx_staging_sale_date (sale_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS sales_daily_agg (
  sale_date   DATE NOT NULL,
  store_code  VARCHAR(20) NOT NULL,
  val_vda     DECIMAL(15,2) NOT NULL DEFAULT 0,
  qty_vda     DECIMAL(15,4) NOT NULL DEFAULT 0,
  val_cus     DECIMAL(15,2) DEFAULT 0,
  val_dev     DECIMAL(15,2) DEFAULT 0,
  val_sld     DECIMAL(15,2) DEFAULT 0,
  per_mrg     DECIMAL(7,2) DEFAULT 0,
  PRIMARY KEY (sale_date, store_code),
  INDEX idx_daily_sale_date (sale_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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
  qty_vda     DECIMAL(15,4) NOT NULL DEFAULT 0,
  val_cus     DECIMAL(15,2) DEFAULT 0,
  val_dev     DECIMAL(15,2) DEFAULT 0,
  val_sld     DECIMAL(15,2) DEFAULT 0,
  per_mrg     DECIMAL(7,2) DEFAULT 0,
  PRIMARY KEY (sale_date, store_code, prod_code),
  INDEX idx_prod_daily_sale_date (sale_date),
  INDEX idx_prod_daily_prod_code (prod_code),
  INDEX idx_prod_daily_depto (depto),
  INDEX idx_prod_daily_secao (secao),
  INDEX idx_prod_daily_grupo (grupo),
  INDEX idx_prod_daily_subgrupo (subgrupo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS import_log (
  id          BIGINT AUTO_INCREMENT PRIMARY KEY,
  sale_date   DATE NOT NULL UNIQUE,
  row_count   INT NOT NULL DEFAULT 0,
  imported_by VARCHAR(36),
  imported_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  batch_id    VARCHAR(36) NOT NULL,
  INDEX idx_import_sale_date (sale_date)
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

-- Universo de PLUs: uma linha por (prod_code, store_code) que JÁ vendeu alguma
-- vez dentro da janela de retenção, com a categoria e o nome da venda mais
-- recente, mais a data dessa venda.
--
-- Derivada de sales_prod_daily_agg (como a filter_hierarchy), regenerada por
-- refresh_product_universe() ao fim de cada import e após o purge.
--
-- Existe por performance. O KPI "PLUs sem venda" precisa comparar o período
-- contra todo o histórico; fazer isso direto no sales_prod_daily_agg custa um
-- COUNT(DISTINCT) sobre ~3,4M linhas — medido em 4,6s contra 0,4s da consulta
-- só do período, numa tela que não tem cache. Aqui são ~176k linhas.
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

-- Trilha de auditoria: ações sensíveis de auth e admin.
-- actor_email é desnormalizado de propósito — o registro precisa sobreviver
-- mesmo se o usuário for removido depois.
CREATE TABLE IF NOT EXISTS audit_log (
  id          BIGINT AUTO_INCREMENT PRIMARY KEY,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actor_id    VARCHAR(36),
  actor_email VARCHAR(255),
  action      VARCHAR(60) NOT NULL,
  target_type VARCHAR(40),
  target_id   VARCHAR(255),
  detail      VARCHAR(500),
  ip          VARCHAR(45),
  INDEX idx_audit_created (created_at),
  INDEX idx_audit_actor (actor_id),
  INDEX idx_audit_action (action)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Heartbeat das crons: cada job faz upsert do seu último run para o
-- painel admin mostrar se está rodando no prazo.
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

  -- Result set 1: aggregates
  -- Só `total` é lido (callMetrics, em src/lib/api-types.ts). Este SELECT também
  -- calculava total_plus/plus_with_sale/plus_without_sale, que o TypeScript
  -- descartava: três COUNT(DISTINCT prod_code) sobre a janela filtrada de
  -- sales_prod_daily_agg (~3,4M linhas) a cada chamada, sem nenhum leitor.
  -- Os KPIs equivalentes que existem de verdade ficam em area_analysis, que os
  -- entrega para a tela de área — não confundir os dois.
  SELECT COALESCE(SUM(val_vda), 0) AS total
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
      OR a.subgrupo IN (SELECT t.subgrupo FROM tmp_filters t WHERE t.subgrupo IS NOT NULL));

  -- Result set 2: byStore
  SELECT a.store_code AS code, s.store_name AS name, SUM(a.val_vda) AS val
  FROM sales_prod_daily_agg a
  LEFT JOIN stores s ON s.store_code = a.store_code
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
  GROUP BY a.store_code, s.store_name
  ORDER BY val DESC;

  -- Result set 3: byDepto
  SELECT a.depto AS name, SUM(a.val_vda) AS val
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
    AND a.depto IS NOT NULL
  GROUP BY a.depto
  ORDER BY val DESC;

  -- Result set 4: byDate
  SELECT a.sale_date AS date, SUM(a.val_vda) AS val
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
  GROUP BY a.sale_date
  ORDER BY a.sale_date;

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

  -- byDepto
  PREPARE stmt FROM 'SELECT depto AS name, SUM(val_vda) AS val
    FROM sales_prod_daily_agg a
    WHERE (? IS NULL OR a.sale_date >= ?)
      AND (? IS NULL OR a.sale_date <= ?)
      AND (NOT EXISTS (SELECT 1 FROM tmp_filters t WHERE t.store_code IS NOT NULL) OR a.store_code IN (SELECT t.store_code FROM tmp_filters t WHERE t.store_code IS NOT NULL))
      AND (NOT EXISTS (SELECT 1 FROM tmp_filters t WHERE t.depto IS NOT NULL) OR a.depto IN (SELECT t.depto FROM tmp_filters t WHERE t.depto IS NOT NULL))
      AND (NOT EXISTS (SELECT 1 FROM tmp_filters t WHERE t.secao IS NOT NULL) OR a.secao IN (SELECT t.secao FROM tmp_filters t WHERE t.secao IS NOT NULL))
      AND (NOT EXISTS (SELECT 1 FROM tmp_filters t WHERE t.grupo IS NOT NULL) OR a.grupo IN (SELECT t.grupo FROM tmp_filters t WHERE t.grupo IS NOT NULL))
      AND (NOT EXISTS (SELECT 1 FROM tmp_filters t WHERE t.subgrupo IS NOT NULL) OR a.subgrupo IN (SELECT t.subgrupo FROM tmp_filters t WHERE t.subgrupo IS NOT NULL))
      AND a.depto IS NOT NULL
    GROUP BY a.depto ORDER BY val DESC LIMIT ?';
  EXECUTE stmt USING p_date_from, p_date_from, p_date_to, p_date_to, @limit_val;
  DEALLOCATE PREPARE stmt;

  -- bySecao
  PREPARE stmt FROM 'SELECT a.secao AS name, SUM(a.val_vda) AS val
    FROM sales_prod_daily_agg a
    WHERE (? IS NULL OR a.sale_date >= ?)
      AND (? IS NULL OR a.sale_date <= ?)
      AND (NOT EXISTS (SELECT 1 FROM tmp_filters t WHERE t.store_code IS NOT NULL) OR a.store_code IN (SELECT t.store_code FROM tmp_filters t WHERE t.store_code IS NOT NULL))
      AND (NOT EXISTS (SELECT 1 FROM tmp_filters t WHERE t.depto IS NOT NULL) OR a.depto IN (SELECT t.depto FROM tmp_filters t WHERE t.depto IS NOT NULL))
      AND (NOT EXISTS (SELECT 1 FROM tmp_filters t WHERE t.secao IS NOT NULL) OR a.secao IN (SELECT t.secao FROM tmp_filters t WHERE t.secao IS NOT NULL))
      AND (NOT EXISTS (SELECT 1 FROM tmp_filters t WHERE t.grupo IS NOT NULL) OR a.grupo IN (SELECT t.grupo FROM tmp_filters t WHERE t.grupo IS NOT NULL))
      AND (NOT EXISTS (SELECT 1 FROM tmp_filters t WHERE t.subgrupo IS NOT NULL) OR a.subgrupo IN (SELECT t.subgrupo FROM tmp_filters t WHERE t.subgrupo IS NOT NULL))
      AND a.secao IS NOT NULL
    GROUP BY a.secao ORDER BY val DESC LIMIT ?';
  EXECUTE stmt USING p_date_from, p_date_from, p_date_to, p_date_to, @limit_val;
  DEALLOCATE PREPARE stmt;

  -- byGrupo
  PREPARE stmt FROM 'SELECT a.grupo AS name, SUM(a.val_vda) AS val
    FROM sales_prod_daily_agg a
    WHERE (? IS NULL OR a.sale_date >= ?)
      AND (? IS NULL OR a.sale_date <= ?)
      AND (NOT EXISTS (SELECT 1 FROM tmp_filters t WHERE t.store_code IS NOT NULL) OR a.store_code IN (SELECT t.store_code FROM tmp_filters t WHERE t.store_code IS NOT NULL))
      AND (NOT EXISTS (SELECT 1 FROM tmp_filters t WHERE t.depto IS NOT NULL) OR a.depto IN (SELECT t.depto FROM tmp_filters t WHERE t.depto IS NOT NULL))
      AND (NOT EXISTS (SELECT 1 FROM tmp_filters t WHERE t.secao IS NOT NULL) OR a.secao IN (SELECT t.secao FROM tmp_filters t WHERE t.secao IS NOT NULL))
      AND (NOT EXISTS (SELECT 1 FROM tmp_filters t WHERE t.grupo IS NOT NULL) OR a.grupo IN (SELECT t.grupo FROM tmp_filters t WHERE t.grupo IS NOT NULL))
      AND (NOT EXISTS (SELECT 1 FROM tmp_filters t WHERE t.subgrupo IS NOT NULL) OR a.subgrupo IN (SELECT t.subgrupo FROM tmp_filters t WHERE t.subgrupo IS NOT NULL))
      AND a.grupo IS NOT NULL
    GROUP BY a.grupo ORDER BY val DESC LIMIT ?';
  EXECUTE stmt USING p_date_from, p_date_from, p_date_to, p_date_to, @limit_val;
  DEALLOCATE PREPARE stmt;

  -- bySubgrupo
  PREPARE stmt FROM 'SELECT a.subgrupo AS name, SUM(a.val_vda) AS val
    FROM sales_prod_daily_agg a
    WHERE (? IS NULL OR a.sale_date >= ?)
      AND (? IS NULL OR a.sale_date <= ?)
      AND (NOT EXISTS (SELECT 1 FROM tmp_filters t WHERE t.store_code IS NOT NULL) OR a.store_code IN (SELECT t.store_code FROM tmp_filters t WHERE t.store_code IS NOT NULL))
      AND (NOT EXISTS (SELECT 1 FROM tmp_filters t WHERE t.depto IS NOT NULL) OR a.depto IN (SELECT t.depto FROM tmp_filters t WHERE t.depto IS NOT NULL))
      AND (NOT EXISTS (SELECT 1 FROM tmp_filters t WHERE t.secao IS NOT NULL) OR a.secao IN (SELECT t.secao FROM tmp_filters t WHERE t.secao IS NOT NULL))
      AND (NOT EXISTS (SELECT 1 FROM tmp_filters t WHERE t.grupo IS NOT NULL) OR a.grupo IN (SELECT t.grupo FROM tmp_filters t WHERE t.grupo IS NOT NULL))
      AND (NOT EXISTS (SELECT 1 FROM tmp_filters t WHERE t.subgrupo IS NOT NULL) OR a.subgrupo IN (SELECT t.subgrupo FROM tmp_filters t WHERE t.subgrupo IS NOT NULL))
      AND a.subgrupo IS NOT NULL
    GROUP BY a.subgrupo ORDER BY val DESC LIMIT ?';
  EXECUTE stmt USING p_date_from, p_date_from, p_date_to, p_date_to, @limit_val;
  DEALLOCATE PREPARE stmt;

  -- byProduto
  PREPARE stmt FROM 'SELECT a.prod_code AS code, a.prod_name AS name, SUM(a.val_vda) AS val
    FROM sales_prod_daily_agg a
    WHERE (? IS NULL OR a.sale_date >= ?)
      AND (? IS NULL OR a.sale_date <= ?)
      AND (NOT EXISTS (SELECT 1 FROM tmp_filters t WHERE t.store_code IS NOT NULL) OR a.store_code IN (SELECT t.store_code FROM tmp_filters t WHERE t.store_code IS NOT NULL))
      AND (NOT EXISTS (SELECT 1 FROM tmp_filters t WHERE t.depto IS NOT NULL) OR a.depto IN (SELECT t.depto FROM tmp_filters t WHERE t.depto IS NOT NULL))
      AND (NOT EXISTS (SELECT 1 FROM tmp_filters t WHERE t.secao IS NOT NULL) OR a.secao IN (SELECT t.secao FROM tmp_filters t WHERE t.secao IS NOT NULL))
      AND (NOT EXISTS (SELECT 1 FROM tmp_filters t WHERE t.grupo IS NOT NULL) OR a.grupo IN (SELECT t.grupo FROM tmp_filters t WHERE t.grupo IS NOT NULL))
      AND (NOT EXISTS (SELECT 1 FROM tmp_filters t WHERE t.subgrupo IS NOT NULL) OR a.subgrupo IN (SELECT t.subgrupo FROM tmp_filters t WHERE t.subgrupo IS NOT NULL))
    GROUP BY a.prod_code, a.prod_name ORDER BY val DESC LIMIT ?';
  EXECUTE stmt USING p_date_from, p_date_from, p_date_to, p_date_to, @limit_val;
  DEALLOCATE PREPARE stmt;

  DROP TEMPORARY TABLE IF EXISTS tmp_filters;
END//

-- 3/16: filter_options (uses filter_hierarchy — 21k rows instead of 942k)
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

  -- All queries use filter_hierarchy (21k rows) — no date filtering on options
  -- Stores: filter by depto/secao/grupo selections
  SELECT DISTINCT f.store_code, COALESCE(s.store_name, f.store_code) AS store_name
  FROM filter_hierarchy f
  LEFT JOIN stores s ON s.store_code = f.store_code
  WHERE (v_has_depto = 0 OR f.depto IN (SELECT t.depto FROM tmp_filters t WHERE t.depto IS NOT NULL))
    AND (v_has_secao = 0 OR f.secao IN (SELECT t.secao FROM tmp_filters t WHERE t.secao IS NOT NULL))
    AND (v_has_grupo = 0 OR f.grupo IN (SELECT t.grupo FROM tmp_filters t WHERE t.grupo IS NOT NULL))
  ORDER BY f.store_code;

  -- Deptos: filter by store/secao/grupo selections
  SELECT DISTINCT f.depto
  FROM filter_hierarchy f
  WHERE f.depto IS NOT NULL
    AND (v_has_store = 0 OR f.store_code IN (SELECT t.store_code FROM tmp_filters t WHERE t.store_code IS NOT NULL))
    AND (v_has_secao = 0 OR f.secao IN (SELECT t.secao FROM tmp_filters t WHERE t.secao IS NOT NULL))
    AND (v_has_grupo = 0 OR f.grupo IN (SELECT t.grupo FROM tmp_filters t WHERE t.grupo IS NOT NULL))
  ORDER BY f.depto;

  -- Secoes: filter by store/depto/grupo selections
  SELECT DISTINCT f.secao
  FROM filter_hierarchy f
  WHERE f.secao IS NOT NULL
    AND (v_has_store = 0 OR f.store_code IN (SELECT t.store_code FROM tmp_filters t WHERE t.store_code IS NOT NULL))
    AND (v_has_depto = 0 OR f.depto IN (SELECT t.depto FROM tmp_filters t WHERE t.depto IS NOT NULL))
    AND (v_has_grupo = 0 OR f.grupo IN (SELECT t.grupo FROM tmp_filters t WHERE t.grupo IS NOT NULL))
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
  -- Venda e "PLUs com venda" saem do PERÍODO; o universo sai da
  -- product_universe, que não tem recorte de data — é todo PLU que já vendeu
  -- dentro da retenção, sob os mesmos filtros de loja/categoria.
  --
  -- Antes as três contagens saíam da mesma varredura do período, e como o
  -- parser descarta linha de valor zero (xlsx-parser.ts), nunca existia linha
  -- com val_vda = 0: "PLUs sem venda" dava 0 sempre e "PLUs (área)" repetia
  -- "PLUs com venda". Medido em prod: 339.007 linhas no período, ZERO com
  -- val_vda <= 0.
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

  -- GREATEST protege dois casos em que o universo pode ficar momentaneamente
  -- menor que o período: a product_universe desatualizada (import gravou o agg
  -- mas o refresh falhou) e o PLU reclassificado — o universo guarda a
  -- categoria da última venda, então sob filtro de categoria ele pode aparecer
  -- no período e não no universo. Nenhum dos dois pode virar KPI negativo.
  SELECT
    v_total                                  AS total,
    GREATEST(v_universe, v_with_sale)        AS plus_total,
    v_with_sale                              AS plus_with_sale,
    GREATEST(v_universe - v_with_sale, 0)    AS plus_without_sale;

  -- Result set 2: total count for pagination
  SELECT COUNT(*) AS total_products FROM (
    SELECT DISTINCT a.prod_code
    FROM sales_prod_daily_agg a
    WHERE (p_date_from IS NULL OR a.sale_date >= p_date_from)
      AND (p_date_to IS NULL OR a.sale_date <= p_date_to)
      AND (NOT EXISTS (SELECT 1 FROM tmp_filters t WHERE t.store_code IS NOT NULL) OR a.store_code IN (SELECT t.store_code FROM tmp_filters t WHERE t.store_code IS NOT NULL))
      AND (NOT EXISTS (SELECT 1 FROM tmp_filters t WHERE t.depto IS NOT NULL) OR a.depto IN (SELECT t.depto FROM tmp_filters t WHERE t.depto IS NOT NULL))
      AND (NOT EXISTS (SELECT 1 FROM tmp_filters t WHERE t.secao IS NOT NULL) OR a.secao IN (SELECT t.secao FROM tmp_filters t WHERE t.secao IS NOT NULL))
      AND (NOT EXISTS (SELECT 1 FROM tmp_filters t WHERE t.grupo IS NOT NULL) OR a.grupo IN (SELECT t.grupo FROM tmp_filters t WHERE t.grupo IS NOT NULL))
      AND (NOT EXISTS (SELECT 1 FROM tmp_filters t WHERE t.subgrupo IS NOT NULL) OR a.subgrupo IN (SELECT t.subgrupo FROM tmp_filters t WHERE t.subgrupo IS NOT NULL))
  ) sub;

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
  SET @sql = CONCAT(
     -- last_sale_date: MAX dentro do período quando existe, senão a última
     -- venda registrada na product_universe.
     --
     -- O MAX sozinho é limitado ao recorte e não consegue apontar para antes do
     -- início do período. Hoje isso não aparece, porque a listagem só traz PLU
     -- que vendeu no período — e para esses o MAX já é a resposta certa. O
     -- COALESCE existe para o PLU SEM venda no período: aí o MAX é NULL e a
     -- resposta correta ("vendeu pela última vez antes do recorte") só está no
     -- universo. Mantido nesta ordem de propósito: preserva o comportamento
     -- atual e não passa a exibir data posterior ao fim do período.
     -- A subquery respeita o filtro de loja para não trazer a última venda de
     -- uma loja que o usuário tirou do recorte.
     'SELECT a.prod_code, a.prod_name, a.depto, a.secao, a.grupo, a.subgrupo,
              SUM(a.val_vda) AS val, SUM(a.qty_vda) AS qty,
              COALESCE(MAX(a.sale_date),
                (SELECT MAX(u.last_sale_date) FROM product_universe u
                  WHERE u.prod_code = a.prod_code
                    AND (NOT EXISTS (SELECT 1 FROM tmp_filters t WHERE t.store_code IS NOT NULL)
                      OR u.store_code IN (SELECT t.store_code FROM tmp_filters t WHERE t.store_code IS NOT NULL))
                )) AS last_sale_date
      FROM sales_prod_daily_agg a
      WHERE (? IS NULL OR a.sale_date >= ?)
        AND (? IS NULL OR a.sale_date <= ?)
        AND (NOT EXISTS (SELECT 1 FROM tmp_filters t WHERE t.store_code IS NOT NULL) OR a.store_code IN (SELECT t.store_code FROM tmp_filters t WHERE t.store_code IS NOT NULL))
        AND (NOT EXISTS (SELECT 1 FROM tmp_filters t WHERE t.depto IS NOT NULL) OR a.depto IN (SELECT t.depto FROM tmp_filters t WHERE t.depto IS NOT NULL))
        AND (NOT EXISTS (SELECT 1 FROM tmp_filters t WHERE t.secao IS NOT NULL) OR a.secao IN (SELECT t.secao FROM tmp_filters t WHERE t.secao IS NOT NULL))
        AND (NOT EXISTS (SELECT 1 FROM tmp_filters t WHERE t.grupo IS NOT NULL) OR a.grupo IN (SELECT t.grupo FROM tmp_filters t WHERE t.grupo IS NOT NULL))
        AND (NOT EXISTS (SELECT 1 FROM tmp_filters t WHERE t.subgrupo IS NOT NULL) OR a.subgrupo IN (SELECT t.subgrupo FROM tmp_filters t WHERE t.subgrupo IS NOT NULL))',
    IF(p_search IS NOT NULL AND p_search != '',
      ' AND (a.prod_name LIKE ? OR a.prod_code LIKE ?)', ''),
    ' GROUP BY a.prod_code, a.prod_name, a.depto, a.secao, a.grupo, a.subgrupo',
    IF(p_sort_by IS NOT NULL AND p_sort_by != '',
      CONCAT(' ORDER BY ', p_sort_by, ' ', IF(p_sort_dir = 'asc' OR p_sort_dir = 'ASC', 'ASC', 'DESC')),
      ' ORDER BY val DESC'),
    IF(v_limit > 0, CONCAT(' LIMIT ', v_limit), ''),
    IF(v_offset > 0, CONCAT(' OFFSET ', v_offset), '')
  );

  IF p_search IS NOT NULL AND p_search != '' THEN
    SET @search_param = CONCAT('%', p_search, '%');
    PREPARE stmt FROM @sql;
    EXECUTE stmt USING p_date_from, p_date_from, p_date_to, p_date_to, @search_param, @search_param;
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
CREATE PROCEDURE product_analysis(
  p_prod_code VARCHAR(20),
  p_store_code VARCHAR(20),
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
    AND (p_store_code IS NULL OR store_code = p_store_code);

  -- Result set 3: byStore
  SELECT a.store_code AS code, COALESCE(s.store_name, a.store_code) AS name, SUM(a.val_vda) AS val
  FROM sales_prod_daily_agg a
  LEFT JOIN stores s ON s.store_code = a.store_code
  WHERE a.prod_code = p_prod_code
    AND a.sale_date = v_ref_date
  GROUP BY a.store_code, s.store_name
  ORDER BY val DESC;

  -- Result set 4: evolution (last 28 days)
  SELECT a.sale_date AS date, SUM(a.val_vda) AS val
  FROM sales_prod_daily_agg a
  WHERE a.prod_code = p_prod_code
    AND a.sale_date >= DATE_SUB(v_ref_date, INTERVAL 28 DAY)
    AND a.sale_date <= v_ref_date
    AND (p_store_code IS NULL OR a.store_code = p_store_code)
  GROUP BY a.sale_date
  ORDER BY a.sale_date;

  -- Result set 5: lastFourSameWeekday
  SELECT a.sale_date AS date, SUM(a.val_vda) AS val
  FROM sales_prod_daily_agg a
  WHERE a.prod_code = p_prod_code
    AND DAYOFWEEK(a.sale_date) = DAYOFWEEK(v_ref_date)
    AND a.sale_date < v_ref_date
    AND (p_store_code IS NULL OR a.store_code = p_store_code)
  GROUP BY a.sale_date
  ORDER BY a.sale_date DESC
  LIMIT 4;

  -- Result set 6: lastFourAll
  SELECT a.sale_date AS date, SUM(a.val_vda) AS val
  FROM sales_prod_daily_agg a
  WHERE a.prod_code = p_prod_code
    AND a.sale_date < v_ref_date
    AND (p_store_code IS NULL OR a.store_code = p_store_code)
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

  INSERT INTO sales_daily_agg (sale_date, store_code, val_vda, qty_vda, val_cus, val_dev, val_sld, per_mrg)
  SELECT
    p_sale_date,
    s.store_code,
    COALESCE(SUM(s.val_vda), 0),
    COALESCE(SUM(s.qty_vda), 0),
    COALESCE(SUM(s.val_cus), 0),
    COALESCE(SUM(s.val_dev), 0),
    COALESCE(SUM(s.val_sld), 0),
    CASE WHEN COALESCE(SUM(s.val_vda_liq), 0) > 0
      THEN ROUND((COALESCE(SUM(s.val_vda_liq), 0) - COALESCE(SUM(s.val_cus_liq), 0)) / COALESCE(SUM(s.val_vda_liq), 0) * 100, 2)
      ELSE 0 END
  FROM staging_sales s
  WHERE s.batch_id = p_batch_id AND s.sale_date = p_sale_date
  GROUP BY s.store_code;

  INSERT INTO sales_prod_daily_agg (sale_date, store_code, prod_code, prod_name, depto, secao, grupo, subgrupo, val_vda, qty_vda, val_cus, val_dev, val_sld, per_mrg)
  SELECT
    p_sale_date,
    s.store_code,
    s.prod_code,
    MAX(s.prod_name),
    s.depto,
    s.secao,
    s.grupo,
    s.subgrupo,
    COALESCE(SUM(s.val_vda), 0),
    COALESCE(SUM(s.qty_vda), 0),
    COALESCE(SUM(s.val_cus), 0),
    COALESCE(SUM(s.val_dev), 0),
    COALESCE(SUM(s.val_sld), 0),
    CASE WHEN COALESCE(SUM(s.val_vda_liq), 0) > 0
      THEN ROUND((COALESCE(SUM(s.val_vda_liq), 0) - COALESCE(SUM(s.val_cus_liq), 0)) / COALESCE(SUM(s.val_vda_liq), 0) * 100, 2)
      ELSE 0 END
  FROM staging_sales s
  WHERE s.batch_id = p_batch_id AND s.sale_date = p_sale_date
  GROUP BY s.store_code, s.prod_code, s.depto, s.secao, s.grupo, s.subgrupo;

  DELETE FROM staging_sales WHERE batch_id = p_batch_id AND sale_date = p_sale_date;

  INSERT INTO import_log (sale_date, row_count, imported_by, batch_id)
  VALUES (p_sale_date, p_row_count, p_imported_by, p_batch_id)
  ON DUPLICATE KEY UPDATE
    row_count = VALUES(row_count),
    imported_by = VALUES(imported_by),
    imported_at = CURRENT_TIMESTAMP,
    batch_id = VALUES(batch_id);

  CALL refresh_filter_hierarchy();
  CALL refresh_product_universe();

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
-- Outra ponta da invariante de retenção; o lado JS está em
-- src/lib/retention.ts (isWithinRetention), usado pelo import-watch para não
-- importar o que este purge apagaria — senão vira um loop diário de
-- importar -> purgar -> reimportar.
--
-- A comparação é ESTRITA (`< @cutoff`), logo a data exatamente na borda
-- (p_days atrás) é PRESERVADA. O lado JS usa `<=` justamente para casar com
-- isso. Mexeu em um, revise o outro.
--
-- DEPENDÊNCIA DE FUSO: os dois lados só coincidem porque o host e o MariaDB
-- estão em UTC (`time_zone = SYSTEM`, TZ do host `Etc/UTC`) — aí CURRENT_DATE é
-- o mesmo dia que o JS calcula em UTC. Trocar o fuso para America/Sao_Paulo faz
-- CURRENT_DATE virar 3h antes do dia UTC e desalinha a borda em um dia.
CREATE PROCEDURE purge_old_aggs(p_days INT)
BEGIN
  DECLARE v_deleted INT DEFAULT 0;
  SET @cutoff = DATE_SUB(CURRENT_DATE, INTERVAL COALESCE(p_days, 180) DAY);

  DELETE FROM sales_daily_agg WHERE sale_date < @cutoff;
  SET v_deleted = v_deleted + ROW_COUNT();

  DELETE FROM sales_prod_daily_agg WHERE sale_date < @cutoff;
  SET v_deleted = v_deleted + ROW_COUNT();

  DELETE FROM import_log WHERE sale_date < @cutoff;
  SET v_deleted = v_deleted + ROW_COUNT();

  -- O universo de PLUs é derivado do agg que acabou de encolher: um PLU cuja
  -- última venda saiu na poda tem que sair do universo também, senão passa a
  -- contar como "sem venda" para sempre.
  IF v_deleted > 0 THEN
    CALL refresh_product_universe();
  END IF;

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
CREATE PROCEDURE refresh_filter_hierarchy()
BEGIN
  TRUNCATE TABLE filter_hierarchy;

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
END//

-- 15/16: refresh_product_universe
-- Regenera a product_universe do zero (mesmo padrão da refresh_filter_hierarchy:
-- a tabela é derivada, então é recriada, nunca editada em linha).
--
-- O JOIN com o MAX(sale_date) por (prod_code, store_code) serve a dois
-- propósitos de uma vez: `a.sale_date` já É a última venda, e nome/categoria
-- saem da linha mais recente — um PLU reclassificado fica com a categoria
-- atual, não com a primeira que teve. Como a PK do agg é
-- (sale_date, store_code, prod_code), o JOIN devolve exatamente uma linha por
-- par.
CREATE PROCEDURE refresh_product_universe()
BEGIN
  TRUNCATE TABLE product_universe;

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
END//

-- 16/16: has_role
CREATE PROCEDURE has_role(p_user_id VARCHAR(36), p_role VARCHAR(20))
BEGIN
  SELECT COUNT(*) > 0 AS has_role
  FROM users
  WHERE id = p_user_id AND role = p_role AND is_active = TRUE;
END//

DELIMITER ;
