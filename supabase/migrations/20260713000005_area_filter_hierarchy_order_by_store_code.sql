
CREATE OR REPLACE FUNCTION public.area_filter_hierarchy()
 RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path TO 'public'
AS $$
DECLARE
  v_latest date;
  v_hierarchy jsonb;
  v_available jsonb;
BEGIN
  IF NOT public.is_active_user(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;

  SELECT coalesce(jsonb_agg(sale_date ORDER BY sale_date), '[]'::jsonb)
    INTO v_available
  FROM (SELECT DISTINCT sale_date FROM public.import_log) t;

  SELECT max(sale_date) INTO v_latest FROM public.import_log;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'store_code', store_code, 'store_name', store_name,
    'depto', depto, 'secao', secao, 'grupo', grupo, 'subgrupo', subgrupo
  ) ORDER BY store_code, depto, secao, grupo, subgrupo), '[]'::jsonb)
  INTO v_hierarchy
  FROM public.filter_hierarchy;

  RETURN jsonb_build_object(
    'latestDate', v_latest,
    'hierarchy', v_hierarchy,
    'availableDates', v_available
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.area_filter_hierarchy() TO authenticated;
