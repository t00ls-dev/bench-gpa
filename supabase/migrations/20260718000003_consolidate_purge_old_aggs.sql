-- Consolida purge_old_aggs: remove parâmetro p_days não utilizado,
-- mantém lógica DOW (4 datas por dia-da-semana, ~28 dias).
-- As migrações 00000 e 00001 coexistiam, sendo que 00001 (DOW)
-- sobrescrevia 00000 (cutoff simples) via CREATE OR REPLACE.
-- A versão DOW é superior por preservar distribuição uniforme
-- dos dias da semana, mas ignorava o parâmetro p_days.
-- Esta migration remove o parâmetro fantasma.

DROP FUNCTION IF EXISTS public.purge_old_aggs(integer);

CREATE OR REPLACE FUNCTION public.purge_old_aggs()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total   integer;
  v_dates   date[];
  v_deleted integer;
BEGIN
  SELECT COUNT(*) INTO v_total
  FROM (SELECT DISTINCT sale_date FROM public.sales_prod_daily_agg) t;

  IF v_total < 28 THEN
    RETURN 0;
  END IF;

  WITH ranked AS (
    SELECT sale_date,
      ROW_NUMBER() OVER (
        PARTITION BY EXTRACT(DOW FROM sale_date)
        ORDER BY sale_date DESC
      ) AS rn
    FROM (SELECT DISTINCT sale_date FROM public.sales_prod_daily_agg) t
  )
  SELECT array_agg(sale_date) INTO v_dates
  FROM ranked
  WHERE rn > 4;

  IF array_length(v_dates, 1) IS NULL THEN
    RETURN 0;
  END IF;

  DELETE FROM public.sales_prod_daily_agg WHERE sale_date = ANY(v_dates);
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  DELETE FROM public.sales_daily_agg WHERE sale_date = ANY(v_dates);
  DELETE FROM public.import_log WHERE sale_date = ANY(v_dates);

  RETURN v_deleted;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.purge_old_aggs() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.purge_old_aggs() TO service_role;
