-- production_forecast resolves current hierarchy through product_universe,
-- so the former (store_code, depto, sale_date) index would either be unused
-- or incorrectly require the historical department to match. Local EXPLAIN
-- showed the current-hierarchy join scanning the date range with a block
-- nested loop. This replacement supports store/product identity plus range.
-- It replaces rather than supplements the old index to keep one secondary
-- index on the import path.
ALTER TABLE sales_prod_daily_agg
  DROP INDEX IF EXISTS idx_prod_daily_store_depto_date,
  ADD INDEX IF NOT EXISTS idx_prod_daily_store_prod_date (store_code, prod_code, sale_date),
  ALGORITHM=INPLACE, LOCK=NONE;
