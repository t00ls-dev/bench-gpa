
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
  v_prev_total numeric := 0;
  v_prev_occ bigint := 0;
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
  prev AS (
    SELECT * FROM public.sales
     WHERE p_prev_from IS NOT NULL AND p_prev_to IS NOT NULL
       AND sale_date BETWEEN p_prev_from AND p_prev_to
       AND (p_store    IS NULL OR store_code = p_store)
       AND (p_depto    IS NULL OR depto    = p_depto)
       AND (p_secao    IS NULL OR secao    = p_secao)
       AND (p_grupo    IS NULL OR grupo    = p_grupo)
       AND (p_subgrupo IS NULL OR subgrupo = p_subgrupo)
  ),
  -- universe of PLUs that EVER had sale in the area (for "PLUs without sale")
  universe AS (
    SELECT DISTINCT prod_code FROM public.sales
     WHERE (p_store    IS NULL OR store_code = p_store)
       AND (p_depto    IS NULL OR depto    = p_depto)
       AND (p_secao    IS NULL OR secao    = p_secao)
       AND (p_grupo    IS NULL OR grupo    = p_grupo)
       AND (p_subgrupo IS NULL OR subgrupo = p_subgrupo)
  ),
  cur_agg AS (
    SELECT prod_code, min(prod_name) prod_name,
           min(depto) depto, min(secao) secao, min(grupo) grupo, min(subgrupo) subgrupo,
           sum(val_vda) val, count(*)::bigint qty
    FROM cur GROUP BY prod_code
  ),
  prev_agg AS (
    SELECT prod_code, sum(val_vda) val FROM prev GROUP BY prod_code
  ),
  prev_rank AS (
    SELECT prod_code, row_number() OVER (ORDER BY val DESC) AS r FROM prev_agg WHERE val > 0
  ),
  cur_rank AS (
    SELECT prod_code, row_number() OVER (ORDER BY val DESC) AS r FROM cur_agg WHERE val > 0
  ),
  joined AS (
    SELECT c.*, COALESCE(p.val, 0) AS prev_val,
           cr.r AS cur_r, pr.r AS prev_r
    FROM cur_agg c
    LEFT JOIN prev_agg p ON p.prod_code = c.prod_code
    LEFT JOIN cur_rank cr ON cr.prod_code = c.prod_code
    LEFT JOIN prev_rank pr ON pr.prod_code = c.prod_code
  )
  SELECT
    COALESCE((SELECT sum(val_vda) FROM cur), 0),
    COALESCE((SELECT count(*) FROM cur), 0)::bigint,
    COALESCE((SELECT count(*) FROM universe), 0)::bigint,
    COALESCE((SELECT count(DISTINCT prod_code) FROM cur WHERE val_vda > 0), 0)::bigint,
    COALESCE(jsonb_agg(jsonb_build_object(
      'prod_code', prod_code,
      'prod_name', prod_name,
      'depto', depto, 'secao', secao, 'grupo', grupo, 'subgrupo', subgrupo,
      'val', val, 'qty', qty,
      'prev_val', prev_val,
      'cur_rank', cur_r,
      'prev_rank', prev_r
    ) ORDER BY val DESC NULLS LAST), '[]'::jsonb),
    COALESCE((SELECT jsonb_agg(jsonb_build_object('date', sale_date, 'val', v) ORDER BY sale_date)
              FROM (SELECT sale_date, sum(val_vda) v FROM cur GROUP BY sale_date) g), '[]'::jsonb)
  INTO v_total, v_occ, v_plus_total, v_plus_with_sale, v_products, v_by_date
  FROM joined;

  IF p_prev_from IS NOT NULL THEN
    SELECT COALESCE(sum(val_vda),0), COALESCE(count(*),0)::bigint
      INTO v_prev_total, v_prev_occ FROM prev;
  END IF;

  RETURN jsonb_build_object(
    'total', v_total,
    'occurrences', v_occ,
    'plusTotal', v_plus_total,
    'plusWithSale', v_plus_with_sale,
    'plusWithoutSale', GREATEST(v_plus_total - v_plus_with_sale, 0),
    'avgPerPlu', CASE WHEN v_plus_with_sale > 0 THEN v_total / v_plus_with_sale ELSE 0 END,
    'products', v_products,
    'byDate', v_by_date,
    'prevTotal', v_prev_total,
    'prevOccurrences', v_prev_occ
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.area_analysis(date,date,text,text,text,text,text,date,date) TO authenticated;
