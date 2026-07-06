-- 20260706184001_area_analysis_page.sql
CREATE OR REPLACE FUNCTION public.area_analysis(
  p_date_from date, p_date_to date,
  p_stores text[] DEFAULT '{}'::text[],
  p_deptos text[] DEFAULT '{}'::text[],
  p_secoes text[] DEFAULT '{}'::text[],
  p_grupos text[] DEFAULT '{}'::text[],
  p_subgrupos text[] DEFAULT '{}'::text[],
  p_prod_codes text[] DEFAULT '{}'::text[],
  p_page int DEFAULT NULL,
  p_page_size int DEFAULT 50,
  p_search text DEFAULT '',
  p_sort_by text DEFAULT 'val',
  p_sort_dir text DEFAULT 'desc'
)
 RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path TO 'public'
AS $$
DECLARE
  v_total numeric; v_plus_total bigint; v_plus_with_sale bigint;
  v_products jsonb; v_has_hier boolean;
  v_total_products bigint;
  v_page int; v_page_size int;
  v_offset int;
BEGIN
  IF NOT public.is_active_user(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  v_has_hier := COALESCE(array_length(p_deptos,1),0) > 0
             OR COALESCE(array_length(p_secoes,1),0) > 0
             OR COALESCE(array_length(p_grupos,1),0) > 0
             OR COALESCE(array_length(p_subgrupos,1),0) > 0
             OR COALESCE(array_length(p_prod_codes,1),0) > 0;

  v_page := COALESCE(p_page, 1);
  v_page_size := GREATEST(1, COALESCE(p_page_size, 50));
  v_offset := (v_page - 1) * v_page_size;

  WITH cur AS (
    SELECT prod_code, prod_name, depto, secao, grupo, subgrupo, val_vda, sale_date
      FROM public.sales
     WHERE sale_date BETWEEN p_date_from AND p_date_to
       AND (COALESCE(array_length(p_stores,1),0)=0    OR store_code = ANY(p_stores))
       AND (COALESCE(array_length(p_deptos,1),0)=0    OR depto      = ANY(p_deptos))
       AND (COALESCE(array_length(p_secoes,1),0)=0    OR secao      = ANY(p_secoes))
       AND (COALESCE(array_length(p_grupos,1),0)=0    OR grupo      = ANY(p_grupos))
       AND (COALESCE(array_length(p_subgrupos,1),0)=0 OR subgrupo   = ANY(p_subgrupos))
       AND (COALESCE(array_length(p_prod_codes,1),0)=0 OR prod_code = ANY(p_prod_codes))
  ), cur_agg AS (
    SELECT prod_code, min(prod_name) AS prod_name,
           min(depto) AS depto, min(secao) AS secao,
           min(grupo) AS grupo, min(subgrupo) AS subgrupo,
           sum(val_vda) AS val, count(*)::bigint AS qty
      FROM cur GROUP BY prod_code
  ), universe AS (
    SELECT prod_code, min(prod_name) AS prod_name,
           min(depto) AS depto, min(secao) AS secao,
           min(grupo) AS grupo, min(subgrupo) AS subgrupo
      FROM public.sales
     WHERE v_has_hier
       AND (COALESCE(array_length(p_stores,1),0)=0    OR store_code = ANY(p_stores))
       AND (COALESCE(array_length(p_deptos,1),0)=0    OR depto      = ANY(p_deptos))
       AND (COALESCE(array_length(p_secoes,1),0)=0    OR secao      = ANY(p_secoes))
       AND (COALESCE(array_length(p_grupos,1),0)=0    OR grupo      = ANY(p_grupos))
       AND (COALESCE(array_length(p_subgrupos,1),0)=0 OR subgrupo   = ANY(p_subgrupos))
       AND (COALESCE(array_length(p_prod_codes,1),0)=0 OR prod_code = ANY(p_prod_codes))
     GROUP BY prod_code
  ), joined AS (
    SELECT
      COALESCE(u.prod_code, c.prod_code) AS prod_code,
      COALESCE(u.prod_name, c.prod_name) AS prod_name,
      COALESCE(u.depto, c.depto) AS depto,
      COALESCE(u.secao, c.secao) AS secao,
      COALESCE(u.grupo, c.grupo) AS grupo,
      COALESCE(u.subgrupo, c.subgrupo) AS subgrupo,
      COALESCE(c.val, 0) AS val, COALESCE(c.qty, 0) AS qty
    FROM cur_agg c FULL OUTER JOIN universe u ON u.prod_code = c.prod_code
  ), last_sale AS (
    SELECT s.prod_code, max(s.sale_date) AS last_sale_date
      FROM public.sales s
     WHERE s.prod_code IN (SELECT prod_code FROM joined)
       AND s.sale_date <= p_date_to
       AND (COALESCE(array_length(p_stores,1),0)=0 OR s.store_code = ANY(p_stores))
     GROUP BY s.prod_code
  ), final AS (
    SELECT j.*, ls.last_sale_date FROM joined j
      LEFT JOIN last_sale ls ON ls.prod_code = j.prod_code
  )
  SELECT
    COALESCE((SELECT sum(val) FROM cur_agg), 0),
    COALESCE((SELECT count(*) FROM final), 0)::bigint,
    COALESCE((SELECT count(*) FROM cur_agg WHERE val > 0), 0)::bigint,
    COALESCE((SELECT count(*) FROM final), 0)::bigint
  INTO v_total, v_plus_total, v_plus_with_sale, v_total_products;

  IF p_page IS NULL THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'prod_code', prod_code, 'prod_name', prod_name,
      'depto', depto, 'secao', secao, 'grupo', grupo, 'subgrupo', subgrupo,
      'val', val, 'qty', qty, 'lastSaleDate', last_sale_date
    ) ORDER BY val DESC NULLS LAST, prod_code), '[]'::jsonb)
    INTO v_products FROM final;
  ELSE
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'prod_code', prod_code, 'prod_name', prod_name,
      'depto', depto, 'secao', secao, 'grupo', grupo, 'subgrupo', subgrupo,
      'val', val, 'qty', qty, 'lastSaleDate', last_sale_date
    ) ORDER BY val DESC NULLS LAST, prod_code), '[]'::jsonb)
    INTO v_products FROM (
      SELECT * FROM final
      ORDER BY val DESC NULLS LAST, prod_code
      LIMIT v_page_size OFFSET v_offset
    ) paged;
  END IF;

  RETURN jsonb_build_object(
    'total', v_total, 'plusTotal', v_plus_total,
    'plusWithSale', v_plus_with_sale,
    'plusWithoutSale', GREATEST(v_plus_total - v_plus_with_sale, 0),
    'avgPerPlu', CASE WHEN v_plus_with_sale > 0 THEN v_total / v_plus_with_sale ELSE 0 END,
    'products', v_products, 'byDate', '[]'::jsonb,
    'totalProducts', v_total_products,
    'page', v_page,
    'pageSize', v_page_size,
    'totalPages', CEIL(v_total_products::numeric / v_page_size)::int
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.area_analysis(date, date, text[], text[], text[], text[], text[], text[], int, int, text, text, text) TO authenticated;

-- 20260706184002_product_analysis_opt.sql
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

GRANT EXECUTE ON FUNCTION public.product_analysis(text, text, date) TO authenticated;

-- 20260706184003_area_filter_hierarchy.sql
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
  ) ORDER BY store_name, depto, secao, grupo, subgrupo), '[]'::jsonb)
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