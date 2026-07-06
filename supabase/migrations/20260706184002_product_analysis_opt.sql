CREATE OR REPLACE FUNCTION public.product_analysis(p_prod_code text, p_store_code text DEFAULT NULL::text, p_ref_date date DEFAULT NULL::date)
 RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path TO 'public'
AS $$
DECLARE
  v_ref date; v_ref_val numeric;
  v_prod jsonb; v_by_store jsonb; v_evolution jsonb;
  v_same_wd jsonb; v_all_last jsonb; v_ref_dow int;
BEGIN
  IF NOT public.is_active_user(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;

  IF p_ref_date IS NULL THEN
    SELECT max(sale_date) INTO v_ref FROM public.sales
     WHERE prod_code = p_prod_code
       AND (p_store_code IS NULL OR store_code = p_store_code);
  ELSE
    v_ref := p_ref_date;
  END IF;

  SELECT jsonb_build_object(
      'prod_code', p.prod_code, 'prod_name', p.prod_name,
      'depto', h.depto, 'secao', h.secao, 'grupo', h.grupo, 'subgrupo', h.subgrupo
    ) INTO v_prod
    FROM public.products p
    LEFT JOIN LATERAL (
      SELECT s.depto, s.secao, s.grupo, s.subgrupo FROM public.sales s
      WHERE s.prod_code = p.prod_code ORDER BY s.sale_date DESC LIMIT 1
    ) h ON true
    WHERE p.prod_code = p_prod_code;

  IF v_ref IS NULL THEN
    RETURN jsonb_build_object('product', v_prod, 'refDate', NULL, 'refValue', 0,
      'byStore','[]'::jsonb,'evolution','[]'::jsonb,
      'lastFourSameWeekday','[]'::jsonb,'lastFourAll','[]'::jsonb);
  END IF;

  v_ref_dow := EXTRACT(DOW FROM v_ref)::int;

  SELECT coalesce(sum(val_vda),0) INTO v_ref_val FROM public.sales
   WHERE prod_code = p_prod_code AND sale_date = v_ref
     AND (p_store_code IS NULL OR store_code = p_store_code);

  SELECT coalesce(jsonb_agg(jsonb_build_object('code',store_code,'name',store_name,'val',val) ORDER BY val DESC),'[]'::jsonb)
    INTO v_by_store FROM (
      SELECT store_code, min(store_name) AS store_name, sum(val_vda) AS val
      FROM public.sales WHERE prod_code = p_prod_code AND sale_date = v_ref
        AND (p_store_code IS NULL OR store_code = p_store_code)
      GROUP BY store_code
    ) t;

  WITH agg_all AS (
    SELECT sale_date, sum(val_vda) AS val FROM public.sales
    WHERE prod_code = p_prod_code AND (p_store_code IS NULL OR store_code = p_store_code)
    GROUP BY sale_date
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object('date',sale_date,'val',val) ORDER BY sale_date),'[]'::jsonb)
    INTO v_evolution
    FROM (SELECT sale_date, val FROM agg_all ORDER BY sale_date DESC LIMIT 60) recent
    ORDER BY recent.sale_date;

  WITH agg_all AS (
    SELECT sale_date, sum(val_vda) AS val FROM public.sales
    WHERE prod_code = p_prod_code AND (p_store_code IS NULL OR store_code = p_store_code)
    GROUP BY sale_date
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object('date',sale_date,'val',val) ORDER BY sale_date),'[]'::jsonb)
    INTO v_same_wd FROM (
      SELECT sale_date, val FROM agg_all
      WHERE sale_date < v_ref
        AND EXTRACT(DOW FROM sale_date)::int = v_ref_dow
      ORDER BY sale_date DESC LIMIT 4
    ) same_wd;

  WITH agg_all AS (
    SELECT sale_date, sum(val_vda) AS val FROM public.sales
    WHERE prod_code = p_prod_code AND (p_store_code IS NULL OR store_code = p_store_code)
    GROUP BY sale_date
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object('date',sale_date,'val',val) ORDER BY sale_date),'[]'::jsonb)
    INTO v_all_last FROM (
      SELECT sale_date, val FROM agg_all
      WHERE sale_date < v_ref
      ORDER BY sale_date DESC LIMIT 4
    ) last_all;

  RETURN jsonb_build_object(
    'product', v_prod, 'refDate', v_ref, 'refValue', v_ref_val,
    'byStore', v_by_store, 'evolution', v_evolution,
    'lastFourSameWeekday', v_same_wd, 'lastFourAll', v_all_last
  );
END;
$$;
