-- Removes the quantity/cost/return/margin columns, which never had a data
-- source: the GPA export brings a single measure (VAL_VDA), verified across
-- the 68 spreadsheets in data/ (May-July/2026). All these columns were
-- structurally zero from the start.
--
-- ALGORITHM=INSTANT is explicit on purpose. None of these columns is part of
-- an index, so MariaDB 11.4 can drop just the metadata, without rebuilding
-- the table: which matters a lot on sales_prod_daily_agg (3.3M rows, 554 MB)
-- on a 1-core server, where a rebuild would blow past the migrations step's
-- 3min command_timeout.
--
-- Being explicit, if for some reason INSTANT isn't possible the ALTER FAILS
-- instead of silently falling back to a slow rebuild in the middle of the
-- deploy. In that case, run it manually in a maintenance window without the
-- clause.
--
-- EDITED on 01/08/2026 (QA audit, item 10): a fresh install (empty database)
-- ALWAYS broke here: migrate-schema.sql had already stopped creating these
-- columns a while ago, so DROP COLUMN without IF EXISTS failed with "check
-- that it exists" in any environment that had never run this migration
-- before the baseline changed. Nobody noticed because every existing
-- environment (prod, everyone's dev) already had these columns from when the
-- migration was written. Discovered by running the schema from scratch for
-- the first time (CI, this same audit item).
--
-- Normally a migration already applied in production isn't edited (see
-- scripts/migrations/README.md, "forward-only"). Here it's safe: the runner
-- identifies completed migrations by the FILE NAME in schema_migrations,
-- never re-executes the content. Production (and any database that already
-- ran this migration) is unaffected by this edit in any way. The only effect
-- is fixing whoever hasn't run it yet (a fresh install).
--
-- Correction to the previous comment: MariaDB (unlike vanilla MySQL up to
-- 8.0.29) SUPPORTS `DROP COLUMN IF EXISTS` since the 10.x series, confirmed
-- directly on local MariaDB 11.8. No dynamic SQL needed.

ALTER TABLE staging_sales
  DROP COLUMN IF EXISTS qty_vda,
  DROP COLUMN IF EXISTS val_cus,
  DROP COLUMN IF EXISTS qty_cus,
  DROP COLUMN IF EXISTS val_dev,
  DROP COLUMN IF EXISTS qty_dev,
  DROP COLUMN IF EXISTS val_vda_liq,
  DROP COLUMN IF EXISTS qty_vda_liq,
  DROP COLUMN IF EXISTS val_cus_liq,
  DROP COLUMN IF EXISTS qty_cus_liq,
  DROP COLUMN IF EXISTS val_sld,
  DROP COLUMN IF EXISTS qty_sld,
  DROP COLUMN IF EXISTS per_mrg,
  ALGORITHM=INSTANT;

ALTER TABLE sales_daily_agg
  DROP COLUMN IF EXISTS qty_vda,
  DROP COLUMN IF EXISTS val_cus,
  DROP COLUMN IF EXISTS val_dev,
  DROP COLUMN IF EXISTS val_sld,
  DROP COLUMN IF EXISTS per_mrg,
  ALGORITHM=INSTANT;

ALTER TABLE sales_prod_daily_agg
  DROP COLUMN IF EXISTS qty_vda,
  DROP COLUMN IF EXISTS val_cus,
  DROP COLUMN IF EXISTS val_dev,
  DROP COLUMN IF EXISTS val_sld,
  DROP COLUMN IF EXISTS per_mrg,
  ALGORITHM=INSTANT;
