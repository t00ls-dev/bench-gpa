
CREATE OR REPLACE FUNCTION public.area_product_options(
  p_date_from date, p_date_to date,
  p_stores text[] DEFAULT '{}'::text[],
  p_deptos text[] DEFAULT '{}'::text[],
  p_secoes text[] DEFAULT '{}'::text[],
  p_grupos text[] DEFAULT '{}'::text[],
  p_subgrupos text[] DEFAULT '{}'::text[]
)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $$
DECLARE
  v_results jsonb;
BEGIN
  IF NOT public.is_active_user(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'prod_code', prod_code,
    'prod_name', prod_name
  ) ORDER BY prod_name), '[]'::jsonb)
  INTO v_results
  FROM (
    SELECT prod_code, min(prod_name) AS prod_name
    FROM public.sales_prod_daily_agg
    WHERE sale_date BETWEEN p_date_from AND p_date_to
      AND (COALESCE(array_length(p_stores,1),0)=0    OR store_code = ANY(p_stores))
      AND (COALESCE(array_length(p_deptos,1),0)=0    OR depto      = ANY(p_deptos))
      AND (COALESCE(array_length(p_secoes,1),0)=0    OR secao      = ANY(p_secoes))
      AND (COALESCE(array_length(p_grupos,1),0)=0    OR grupo      = ANY(p_grupos))
      AND (COALESCE(array_length(p_subgrupos,1),0)=0 OR subgrupo   = ANY(p_subgrupos))
    GROUP BY prod_code
  ) t;

  RETURN jsonb_build_object('products', v_results);
END;
$$;
