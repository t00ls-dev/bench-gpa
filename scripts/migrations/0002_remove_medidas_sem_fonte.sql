-- Remove as colunas de quantidade/custo/devolução/margem, que nunca tiveram
-- fonte: o export do GPA traz uma única medida (VAL_VDA), verificado nas 68
-- planilhas de data/ (maio a julho/2026). Todas essas colunas estavam
-- estruturalmente em zero desde sempre.
--
-- ALGORITHM=INSTANT é explícito de propósito. Nenhuma dessas colunas participa
-- de índice, então o MariaDB 11.4 consegue dropar só os metadados, sem
-- reconstruir a tabela: o que importa muito em sales_prod_daily_agg (3,3M
-- linhas, 554 MB) num servidor de 1 núcleo, onde um rebuild estouraria o
-- command_timeout de 3 min do step de migrations.
--
-- Sendo explícito, se por algum motivo o INSTANT não for possível o ALTER FALHA
-- em vez de silenciosamente cair para um rebuild demorado no meio do deploy.
-- Nesse caso, rodar manualmente em janela de manutenção sem a cláusula.
--
-- EDITADO em 01/08/2026 (auditoria de QA, item 10): instalação nova (banco
-- vazio) SEMPRE quebrava aqui: migrate-schema.sql já não cria essas colunas
-- há tempos, então DROP COLUMN sem IF EXISTS falhava com "check that it
-- exists" em qualquer ambiente que nunca tivesse rodado esta migration antes
-- de a baseline mudar. Ninguém notou porque todo ambiente existente (prod,
-- dev de cada um) já tinha essas colunas de quando a migration foi escrita.
-- Descoberto rodando o schema do zero pela primeira vez (CI, este mesmo item
-- da auditoria).
--
-- Normalmente uma migration já aplicada em produção não se edita (ver
-- scripts/migrations/README.md, "forward-only"). Aqui é seguro: o runner
-- identifica migrations concluídas pelo NOME DO ARQUIVO em
-- schema_migrations, nunca reexecuta o conteúdo. Produção (e qualquer banco
-- que já rodou esta migration) não é afetada de forma alguma por esta edição.
-- O único efeito é consertar quem ainda não rodou (instalação nova).
--
-- Correção do comentário anterior: MariaDB (diferente do MySQL vanilla até
-- 8.0.29) SUPORTA `DROP COLUMN IF EXISTS` desde a série 10.x, confirmado
-- direto no MariaDB 11.8 local. Não precisa de SQL dinâmico.

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
