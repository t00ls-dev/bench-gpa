
DROP FUNCTION IF EXISTS public.custom_analysis_results(uuid,date,date,text[],text[],text[],text[],text[]);
DROP TABLE IF EXISTS public.custom_analysis_items CASCADE;
DROP TABLE IF EXISTS public.custom_analyses CASCADE;

DROP FUNCTION IF EXISTS public.area_analysis(date,date,text,text,text,text,text,date,date);

CREATE OR REPLACE FUNCTION public.area_analysis(
  p_date_from date,
  p_date_to date,
  p_stores text[] DEFAULT '{}',
  p_deptos text[] DEFAULT '{}',
  p_secoes text[] DEFAULT '{}',
  p_grupos text[] DEFAULT '{}',
  p_subgrupos text[] DEFAULT '{}',
  p_prod_codes text[] DEFAULT '{}'
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_total numeric;
  v_plus_total bigint;
  v_plus_with_sale bigint;
  v_products jsonb;
  v_by_date jsonb;
BEGIN
  IF NOT public.is_approved(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;

  WITH cur AS (
    SELECT * FROM public.sales
     WHERE sale_date BETWEEN p_date_from AND p_date_to
       AND (COALESCE(array_length(p_stores,1),0)=0    OR store_code = ANY(p_stores))
       AND (COALESCE(array_length(p_deptos,1),0)=0    OR depto      = ANY(p_deptos))
       AND (COALESCE(array_length(p_secoes,1),0)=0    OR secao      = ANY(p_secoes))
       AND (COALESCE(array_length(p_grupos,1),0)=0    OR grupo      = ANY(p_grupos))
       AND (COALESCE(array_length(p_subgrupos,1),0)=0 OR subgrupo   = ANY(p_subgrupos))
       AND (COALESCE(array_length(p_prod_codes,1),0)=0 OR prod_code = ANY(p_prod_codes))
  ),
  universe AS (
    SELECT DISTINCT ON (prod_code)
      prod_code, prod_name, depto, secao, grupo, subgrupo
    FROM public.sales
    WHERE (COALESCE(array_length(p_stores,1),0)=0    OR store_code = ANY(p_stores))
      AND (COALESCE(array_length(p_deptos,1),0)=0    OR depto      = ANY(p_deptos))
      AND (COALESCE(array_length(p_secoes,1),0)=0    OR secao      = ANY(p_secoes))
      AND (COALESCE(array_length(p_grupos,1),0)=0    OR grupo      = ANY(p_grupos))
      AND (COALESCE(array_length(p_subgrupos,1),0)=0 OR subgrupo   = ANY(p_subgrupos))
      AND (COALESCE(array_length(p_prod_codes,1),0)=0 OR prod_code = ANY(p_prod_codes))
    ORDER BY prod_code, sale_date DESC
  ),
  cur_agg AS (
    SELECT prod_code, sum(val_vda) AS val, count(*)::bigint AS qty
    FROM cur GROUP BY prod_code
  ),
  joined AS (
    SELECT u.prod_code, u.prod_name, u.depto, u.secao, u.grupo, u.subgrupo,
           COALESCE(c.val, 0) AS val, COALESCE(c.qty, 0) AS qty
    FROM universe u
    LEFT JOIN cur_agg c ON c.prod_code = u.prod_code
  )
  SELECT
    COALESCE((SELECT sum(val_vda) FROM cur), 0),
    COALESCE((SELECT count(*) FROM universe), 0)::bigint,
    COALESCE((SELECT count(*) FROM cur_agg WHERE val > 0), 0)::bigint,
    COALESCE(jsonb_agg(jsonb_build_object(
      'prod_code', prod_code, 'prod_name', prod_name,
      'depto', depto, 'secao', secao, 'grupo', grupo, 'subgrupo', subgrupo,
      'val', val, 'qty', qty
    ) ORDER BY val DESC NULLS LAST, prod_code), '[]'::jsonb),
    COALESCE((SELECT jsonb_agg(jsonb_build_object('date', sale_date, 'val', v) ORDER BY sale_date)
              FROM (SELECT sale_date, sum(val_vda) v FROM cur GROUP BY sale_date) g), '[]'::jsonb)
  INTO v_total, v_plus_total, v_plus_with_sale, v_products, v_by_date
  FROM joined;

  RETURN jsonb_build_object(
    'total', v_total,
    'plusTotal', v_plus_total,
    'plusWithSale', v_plus_with_sale,
    'plusWithoutSale', GREATEST(v_plus_total - v_plus_with_sale, 0),
    'avgPerPlu', CASE WHEN v_plus_with_sale > 0 THEN v_total / v_plus_with_sale ELSE 0 END,
    'products', v_products,
    'byDate', v_by_date
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.area_analysis(date,date,text[],text[],text[],text[],text[],text[]) TO authenticated;
