-- Remove os 4 índices de categoria (depto/secao/grupo/subgrupo) de
-- sales_prod_daily_agg, a mesma tabela onde area_analysis/dashboard_metrics/
-- product_analysis fazem suas varreduras.
--
-- Medido em produção em 2026-07-30 (scripts/bench-procs.sh, ver
-- docs/medicao-performance.md): filtrar por qualquer uma dessas colunas já
-- custava MAIS que não filtrar: nenhuma proc de análise se beneficiava
-- desses índices, porque o plano de acesso real é sempre a varredura por
-- sale_date. Os 4 juntos ocupavam 532,81 MB (mysql.innodb_index_stats),
-- 74,7% de todo o índice da tabela e quase o tamanho dos dados reais
-- (538,41 MB), contra um innodb_buffer_pool_size de 128 MB nunca ajustado.
--
-- Antes/depois com o mesmo harness confirmou hash idêntico nos 9 cenários
-- (nenhuma proc mudou de resultado) e nenhuma regressão de latência de
-- leitura fora da variação normal. O ganho é o espaço liberado no buffer
-- pool/disco, não velocidade de leitura (que já era zero pra esses índices).
--
-- DROP INDEX IF EXISTS: já foi aplicado manualmente em produção antes desta
-- migration existir (parte da investigação), então precisa ser no-op lá. Em
-- instalação nova, o baseline (migrate-schema.sql) já cria a tabela sem esses
-- índices, também no-op aqui.

ALTER TABLE sales_prod_daily_agg
  DROP INDEX IF EXISTS idx_prod_daily_depto,
  DROP INDEX IF EXISTS idx_prod_daily_secao,
  DROP INDEX IF EXISTS idx_prod_daily_grupo,
  DROP INDEX IF EXISTS idx_prod_daily_subgrupo,
  ALGORITHM=INPLACE, LOCK=NONE;
