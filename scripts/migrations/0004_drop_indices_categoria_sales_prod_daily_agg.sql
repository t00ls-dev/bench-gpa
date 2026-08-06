-- Removes the 4 category indexes (depto/secao/grupo/subgrupo) from
-- sales_prod_daily_agg, the same table where area_analysis/dashboard_metrics/
-- product_analysis do their scans.
--
-- Measured in production on 2026-07-30 (scripts/bench-procs.sh, see
-- docs/medicao-performance.md): filtering by any of these columns already
-- cost MORE than not filtering: no analysis proc benefited from these
-- indexes, because the real access plan is always the scan by sale_date.
-- The 4 together took up 532.81 MB (mysql.innodb_index_stats), 74.7% of the
-- whole table's index and nearly the size of the real data (538.41 MB),
-- against an innodb_buffer_pool_size of 128 MB that was never tuned.
--
-- Before/after with the same harness confirmed identical hashes across the 9
-- scenarios (no proc changed result) and no read-latency regression beyond
-- normal variation. The gain is buffer pool/disk space freed up, not read
-- speed (which was already zero for these indexes).
--
-- DROP INDEX IF EXISTS: already applied manually in production before this
-- migration existed (part of the investigation), so it needs to be a no-op
-- there. On a fresh install, the baseline (migrate-schema.sql) already
-- creates the table without these indexes, also a no-op here.

ALTER TABLE sales_prod_daily_agg
  DROP INDEX IF EXISTS idx_prod_daily_depto,
  DROP INDEX IF EXISTS idx_prod_daily_secao,
  DROP INDEX IF EXISTS idx_prod_daily_grupo,
  DROP INDEX IF EXISTS idx_prod_daily_subgrupo,
  ALGORITHM=INPLACE, LOCK=NONE;
