-- Remove 4 índices secundários redundantes com uma PK/UNIQUE já existente na
-- mesma coluna (ou na coluna mais à esquerda de uma PK composta) — o
-- MariaDB já mantém uma B-tree ordenada por essa coluna via a própria
-- constraint, então o índice nomeado é uma cópia estrutural. Diferente da
-- migration 0004 (índices de categoria, que precisou de medição empírica em
-- produção porque a teoria "filtrar por depto ajuda" era incerta), aqui não
-- há necessidade de medir antes/depois: um índice cuja coluna já é prefixo
-- de uma PK/UNIQUE não pode mudar nenhum plano de acesso — é garantia
-- estrutural do B-tree, não uma suspeita a confirmar. O ganho é só espaço em
-- disco/buffer pool (e um pouco menos de custo de escrita, por não manter
-- mais um índice a cada INSERT).
--
-- - users.email já é UNIQUE (migrate-schema.sql) — idx_users_email duplicado.
-- - products tem PRIMARY KEY (prod_code, sale_date) — idx_products_prod_code
--   (só em prod_code, a coluna mais à esquerda da PK) já é coberto pela PK.
-- - import_log.sale_date já é UNIQUE — idx_import_sale_date duplicado.
-- - sales_prod_daily_agg tem PRIMARY KEY (sale_date, store_code, prod_code)
--   — idx_prod_daily_sale_date (só em sale_date, a coluna mais à esquerda da
--   PK) já é coberto pela PK. 57 MB medidos em produção (31/07/2026).
--
-- DROP INDEX IF EXISTS: no-op em instalação nova, já que o baseline
-- (migrate-schema.sql) passa a criar as tabelas sem esses índices.

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
