-- Remove a tabela public.sales (500MB+) que não é mais utilizada.
-- Todas as RPCs analíticas foram migradas para sales_daily_agg / sales_prod_daily_agg.
-- CASCADE remove policies, indexes, grants atrelados.
DROP TABLE IF EXISTS public.sales CASCADE;
