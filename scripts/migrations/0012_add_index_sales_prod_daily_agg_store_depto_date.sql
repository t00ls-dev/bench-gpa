-- Adds a composite index (store_code, depto, sale_date) to
-- sales_prod_daily_agg, for production_forecast_candidate (see
-- docs/planejamento-producao-perecveis-2026-08-07.md).
--
-- Different from the 4 category indexes removed by migration 0004: those
-- were on OPTIONAL filters (area_analysis/dashboard_metrics let the user
-- filter by depto or not), where the real access plan was always the scan
-- by sale_date regardless. store_code/depto here are always MANDATORY,
-- single-value parameters (this screen always plans for exactly one store),
-- so the access pattern is genuinely different.
--
-- Measured in production, 2026-08-07 (scripts/bench-procs.sh,
-- docs/medicao-performance.md): without this index, the candidate proc
-- scanned the entire table via idx_prod_daily_prod_code (EXPLAIN: rows
-- 3,522,284, `Using where`) because the optimizer preferred it to avoid a
-- filesort on GROUP BY prod_code, ignoring the sale_date range entirely.
-- Median went from 31,826 ms to 250 ms after adding this index (127x),
-- same hash before/after (result unchanged, only speed). Write-side cost
-- measured directly with a synthetic INSERT of one real day's volume
-- (50,534 rows, sale_date = 2099-12-31, deleted right after): +6.4s
-- (8.083s vs 1.718s) on finalize_import's bulk INSERT, which only runs on
-- a manual, on-demand import, not on any read path. Also touches
-- purge_old_aggs's daily 3am DELETE, when nobody is using the app.
--
-- IF NOT EXISTS: a test index under a different name
-- (idx_test_store_depto_date) was created directly in production during
-- this measurement and is dropped here so this migration is the only
-- source of truth for the final name.
ALTER TABLE sales_prod_daily_agg
  DROP INDEX IF EXISTS idx_test_store_depto_date,
  ADD INDEX IF NOT EXISTS idx_prod_daily_store_depto_date (store_code, depto, sale_date),
  ALGORITHM=INPLACE, LOCK=NONE;
