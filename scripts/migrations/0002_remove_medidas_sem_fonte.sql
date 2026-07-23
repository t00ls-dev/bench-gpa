-- Remove as colunas de quantidade/custo/devolução/margem, que nunca tiveram
-- fonte: o export do GPA traz uma única medida (VAL_VDA), verificado nas 68
-- planilhas de data/ (maio a julho/2026). Todas essas colunas estavam
-- estruturalmente em zero desde sempre.
--
-- ALGORITHM=INSTANT é explícito de propósito. Nenhuma dessas colunas participa
-- de índice, então o MariaDB 11.4 consegue dropar só os metadados, sem
-- reconstruir a tabela — o que importa muito em sales_prod_daily_agg (3,3M
-- linhas, 554 MB) num servidor de 1 núcleo, onde um rebuild estouraria o
-- command_timeout de 3 min do step de migrations.
--
-- Sendo explícito, se por algum motivo o INSTANT não for possível o ALTER FALHA
-- em vez de silenciosamente cair para um rebuild demorado no meio do deploy.
-- Nesse caso, rodar manualmente em janela de manutenção sem a cláusula.
--
-- Não é idempotente por limitação do MariaDB (não há DROP COLUMN IF EXISTS);
-- o runner garante execução única via schema_migrations.

ALTER TABLE staging_sales
  DROP COLUMN qty_vda,
  DROP COLUMN val_cus,
  DROP COLUMN qty_cus,
  DROP COLUMN val_dev,
  DROP COLUMN qty_dev,
  DROP COLUMN val_vda_liq,
  DROP COLUMN qty_vda_liq,
  DROP COLUMN val_cus_liq,
  DROP COLUMN qty_cus_liq,
  DROP COLUMN val_sld,
  DROP COLUMN qty_sld,
  DROP COLUMN per_mrg,
  ALGORITHM=INSTANT;

ALTER TABLE sales_daily_agg
  DROP COLUMN qty_vda,
  DROP COLUMN val_cus,
  DROP COLUMN val_dev,
  DROP COLUMN val_sld,
  DROP COLUMN per_mrg,
  ALGORITHM=INSTANT;

ALTER TABLE sales_prod_daily_agg
  DROP COLUMN qty_vda,
  DROP COLUMN val_cus,
  DROP COLUMN val_dev,
  DROP COLUMN val_sld,
  DROP COLUMN per_mrg,
  ALGORITHM=INSTANT;
