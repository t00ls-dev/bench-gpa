-- Removes 4 secondary indexes redundant with a PK/UNIQUE already existing on
-- the same column (or on the leftmost column of a composite PK): MariaDB
-- already keeps a B-tree ordered by that column via the constraint itself,
-- so the named index is a structural copy. Unlike migration 0004 (category
-- indexes, which needed empirical measurement in production because the
-- "filtering by depto helps" theory was uncertain), there's no need to
-- measure before/after here: an index whose column is already a prefix of a
-- PK/UNIQUE can't change any access plan, it's a structural B-tree
-- guarantee, not a suspicion to confirm. The gain is just disk/buffer pool
-- space (and slightly less write cost, from not maintaining an extra index
-- on every INSERT).
--
-- - users.email is already UNIQUE (migrate-schema.sql): idx_users_email is a duplicate.
-- - products has PRIMARY KEY (prod_code, sale_date): idx_products_prod_code
--   (only on prod_code, the PK's leftmost column) is already covered by the PK.
-- - import_log.sale_date is already UNIQUE: idx_import_sale_date is a duplicate.
-- - sales_prod_daily_agg has PRIMARY KEY (sale_date, store_code, prod_code):
--   idx_prod_daily_sale_date (only on sale_date, the PK's leftmost column) is
--   already covered by the PK. 57 MB measured in production (31/07/2026).
--
-- DROP INDEX IF EXISTS: a no-op on a fresh install, since the baseline
-- (migrate-schema.sql) now creates the tables without these indexes.

ALTER TABLE users
  DROP INDEX IF EXISTS idx_users_email,
  ALGORITHM=INPLACE, LOCK=NONE;

ALTER TABLE products
  DROP INDEX IF EXISTS idx_products_prod_code,
  ALGORITHM=INPLACE, LOCK=NONE;

ALTER TABLE import_log
  DROP INDEX IF EXISTS idx_import_sale_date,
  ALGORITHM=INPLACE, LOCK=NONE;

ALTER TABLE sales_prod_daily_agg
  DROP INDEX IF EXISTS idx_prod_daily_sale_date,
  ALGORITHM=INPLACE, LOCK=NONE;
