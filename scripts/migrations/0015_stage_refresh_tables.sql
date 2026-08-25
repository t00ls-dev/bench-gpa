-- Build both derived datasets before opening the replacement transaction.
-- The previous procedures held DELETE locks while running their expensive
-- SELECTs, which made dashboard_metrics and dashboard_rankings time out when
-- they ran concurrently with the 03:30 refresh.

DELIMITER //

DROP PROCEDURE IF EXISTS refresh_filter_hierarchy//
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

DROP PROCEDURE IF EXISTS refresh_product_universe//
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

DELIMITER ;
