-- Purge de agregados antigos para manter free tier saudável
-- Mantém 28 dias de dados em sales_prod_daily_agg e sales_daily_agg

CREATE OR REPLACE FUNCTION public.purge_old_aggs(p_days integer DEFAULT 28)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted integer;
  v_cutoff  date;
BEGIN
  v_cutoff := CURRENT_DATE - p_days;

  DELETE FROM public.sales_prod_daily_agg WHERE sale_date < v_cutoff;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  DELETE FROM public.sales_daily_agg WHERE sale_date < v_cutoff;

  RETURN v_deleted;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.purge_old_aggs(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.purge_old_aggs(integer) TO service_role;
