CREATE OR REPLACE FUNCTION public.area_analysis(p_date_from date, p_date_to date, p_stores text[] DEFAULT '{}'::text[], p_deptos text[] DEFAULT '{}'::text[], p_secoes text[] DEFAULT '{}'::text[], p_grupos text[] DEFAULT '{}'::text[], p_subgrupos text[] DEFAULT '{}'::text[], p_prod_codes text[] DEFAULT '{}'::text[])
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  v_total numeric;
  v_plus_total bigint;
  v_plus_with_sale bigint;
  v_products jsonb;
  v_by_date jsonb;
  v_universe_from date;
BEGIN
  IF NOT public.is_approved(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;

  -- Limit universe scan to a recent window relative to the requested period
  v_universe_from := p_date_from - INTERVAL '90 days';

  WITH cur AS (
    SELECT prod_code, val_vda, sale_date FROM public.sales
     WHERE sale_date BETWEEN p_date_from AND p_date_to
       AND (COALESCE(array_length(p_stores,1),0)=0    OR store_code = ANY(p_stores))
       AND (COALESCE(array_length(p_deptos,1),0)=0    OR depto      = ANY(p_deptos))
       AND (COALESCE(array_length(p_secoes,1),0)=0    OR secao      = ANY(p_secoes))
       AND (COALESCE(array_length(p_grupos,1),0)=0    OR grupo      = ANY(p_grupos))
       AND (COALESCE(array_length(p_subgrupos,1),0)=0 OR subgrupo   = ANY(p_subgrupos))
       AND (COALESCE(array_length(p_prod_codes,1),0)=0 OR prod_code = ANY(p_prod_codes))
  ),
  universe AS (
    SELECT prod_code,
           min(prod_name) AS prod_name,
           min(depto)     AS depto,
           min(secao)     AS secao,
           min(grupo)     AS grupo,
           min(subgrupo)  AS subgrupo
    FROM public.sales
    WHERE sale_date BETWEEN v_universe_from AND p_date_to
      AND (COALESCE(array_length(p_stores,1),0)=0    OR store_code = ANY(p_stores))
      AND (COALESCE(array_length(p_deptos,1),0)=0    OR depto      = ANY(p_deptos))
      AND (COALESCE(array_length(p_secoes,1),0)=0    OR secao      = ANY(p_secoes))
      AND (COALESCE(array_length(p_grupos,1),0)=0    OR grupo      = ANY(p_grupos))
      AND (COALESCE(array_length(p_subgrupos,1),0)=0 OR subgrupo   = ANY(p_subgrupos))
      AND (COALESCE(array_length(p_prod_codes,1),0)=0 OR prod_code = ANY(p_prod_codes))
    GROUP BY prod_code
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
$function$;