-- Mantém exatamente 4 ocorrências de cada dia da semana
-- (4 segundas, 4 terças, etc.), no máximo 28 dias.
-- Se houver menos de 28 datas distintas, não deleta nada.

CREATE OR REPLACE FUNCTION public.purge_old_aggs(p_days integer DEFAULT 28)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total  integer;
  v_dates  date[];
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

REVOKE EXECUTE ON FUNCTION public.purge_old_aggs(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.purge_old_aggs(integer) TO service_role;
