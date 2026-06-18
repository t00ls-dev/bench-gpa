CREATE OR REPLACE FUNCTION public.area_analysis(
  p_date_from date,
  p_date_to date,
  p_store text DEFAULT NULL,
  p_depto text DEFAULT NULL,
  p_secao text DEFAULT NULL,
  p_grupo text DEFAULT NULL,
  p_subgrupo text DEFAULT NULL,
  p_prev_from date DEFAULT NULL,
  p_prev_to date DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_total numeric;
  v_occ bigint;
  v_plus_total bigint;
  v_plus_with_sale bigint;
  v_products jsonb;
  v_by_date jsonb;
BEGIN
  IF NOT public.is_approved(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;

  WITH cur AS (
    SELECT * FROM public.sales
     WHERE sale_date BETWEEN p_date_from AND p_date_to
       AND (p_store    IS NULL OR store_code = p_store)
       AND (p_depto    IS NULL OR depto    = p_depto)
       AND (p_secao    IS NULL OR secao    = p_secao)
       AND (p_grupo    IS NULL OR grupo    = p_grupo)
       AND (p_subgrupo IS NULL OR subgrupo = p_subgrupo)
  ),
  -- Universe: every PLU that has EVER had sales within the selected area filters.
  -- For each PLU keep its most recent area attributes.
  universe AS (
    SELECT DISTINCT ON (prod_code)
      prod_code, prod_name, depto, secao, grupo, subgrupo
    FROM public.sales
    WHERE (p_store    IS NULL OR store_code = p_store)
      AND (p_depto    IS NULL OR depto    = p_depto)
      AND (p_secao    IS NULL OR secao    = p_secao)
      AND (p_grupo    IS NULL OR grupo    = p_grupo)
      AND (p_subgrupo IS NULL OR subgrupo = p_subgrupo)
    ORDER BY prod_code, sale_date DESC
  ),
  cur_agg AS (
    SELECT prod_code,
           sum(val_vda) AS val,
           count(*)::bigint AS qty
    FROM cur GROUP BY prod_code
  ),
  joined AS (
    SELECT u.prod_code, u.prod_name,
           u.depto, u.secao, u.grupo, u.subgrupo,
           COALESCE(c.val, 0) AS val,
           COALESCE(c.qty, 0) AS qty
    FROM universe u
    LEFT JOIN cur_agg c ON c.prod_code = u.prod_code
  )
  SELECT
    COALESCE((SELECT sum(val_vda) FROM cur), 0),
    COALESCE((SELECT count(*) FROM cur), 0)::bigint,
    COALESCE((SELECT count(*) FROM universe), 0)::bigint,
    COALESCE((SELECT count(*) FROM cur_agg WHERE val > 0), 0)::bigint,
    COALESCE(jsonb_agg(jsonb_build_object(
      'prod_code', prod_code,
      'prod_name', prod_name,
      'depto', depto, 'secao', secao, 'grupo', grupo, 'subgrupo', subgrupo,
      'val', val, 'qty', qty
    ) ORDER BY val DESC NULLS LAST, prod_code), '[]'::jsonb),
    COALESCE((SELECT jsonb_agg(jsonb_build_object('date', sale_date, 'val', v) ORDER BY sale_date)
              FROM (SELECT sale_date, sum(val_vda) v FROM cur GROUP BY sale_date) g), '[]'::jsonb)
  INTO v_total, v_occ, v_plus_total, v_plus_with_sale, v_products, v_by_date
  FROM joined;

  RETURN jsonb_build_object(
    'total', v_total,
    'occurrences', v_occ,
    'plusTotal', v_plus_total,
    'plusWithSale', v_plus_with_sale,
    'plusWithoutSale', GREATEST(v_plus_total - v_plus_with_sale, 0),
    'avgPerPlu', CASE WHEN v_plus_with_sale > 0 THEN v_total / v_plus_with_sale ELSE 0 END,
    'products', v_products,
    'byDate', v_by_date,
    'prevTotal', 0,
    'prevOccurrences', 0
  );
END;
$$;