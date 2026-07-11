
CREATE OR REPLACE FUNCTION public.area_analysis(
  p_date_from date, p_date_to date,
  p_stores text[] DEFAULT '{}'::text[],
  p_deptos text[] DEFAULT '{}'::text[],
  p_secoes text[] DEFAULT '{}'::text[],
  p_grupos text[] DEFAULT '{}'::text[],
  p_subgrupos text[] DEFAULT '{}'::text[],
  p_prod_codes text[] DEFAULT '{}'::text[],
  p_page integer DEFAULT NULL::integer,
  p_page_size integer DEFAULT 50,
  p_search text DEFAULT ''::text,
  p_sort_by text DEFAULT 'val'::text,
  p_sort_dir text DEFAULT 'desc'::text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $function$
DECLARE
  v_total numeric; v_plus_total bigint; v_plus_with_sale bigint;
  v_products jsonb; v_has_hier boolean;
  v_total_products bigint;
  v_page int; v_page_size int; v_offset int;
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

  WITH cur_agg AS (
    SELECT prod_code,
           min(prod_name) AS prod_name,
           min(depto) AS depto, min(secao) AS secao,
           min(grupo) AS grupo, min(subgrupo) AS subgrupo,
           sum(val_vda) AS val, sum(item_count)::bigint AS qty
    FROM public.sales_prod_daily_agg
    WHERE sale_date BETWEEN p_date_from AND p_date_to
      AND (COALESCE(array_length(p_stores,1),0)=0    OR store_code = ANY(p_stores))
      AND (COALESCE(array_length(p_deptos,1),0)=0    OR depto      = ANY(p_deptos))
      AND (COALESCE(array_length(p_secoes,1),0)=0    OR secao      = ANY(p_secoes))
      AND (COALESCE(array_length(p_grupos,1),0)=0    OR grupo      = ANY(p_grupos))
      AND (COALESCE(array_length(p_subgrupos,1),0)=0 OR subgrupo   = ANY(p_subgrupos))
      AND (COALESCE(array_length(p_prod_codes,1),0)=0 OR prod_code = ANY(p_prod_codes))
    GROUP BY prod_code
  ), universe AS (
    SELECT prod_code,
           min(prod_name) AS prod_name,
           min(depto) AS depto, min(secao) AS secao,
           min(grupo) AS grupo, min(subgrupo) AS subgrupo
    FROM public.sales_prod_daily_agg
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
      COALESCE(c.val, 0) AS val,
      COALESCE(c.qty, 0) AS qty
    FROM cur_agg c FULL OUTER JOIN universe u ON u.prod_code = c.prod_code
  ), filtered AS (
    SELECT * FROM joined
    WHERE (p_search IS NULL OR p_search = ''
           OR prod_code ILIKE '%'||p_search||'%'
           OR prod_name ILIKE '%'||p_search||'%')
  )
  SELECT
    COALESCE((SELECT sum(val) FROM cur_agg), 0),
    COALESCE((SELECT count(*) FROM joined), 0)::bigint,
    COALESCE((SELECT count(*) FROM cur_agg WHERE val > 0), 0)::bigint,
    COALESCE((SELECT count(*) FROM filtered), 0)::bigint
  INTO v_total, v_plus_total, v_plus_with_sale, v_total_products;

  IF p_page IS NULL THEN
    WITH cur_agg AS (
      SELECT prod_code,
             min(prod_name) AS prod_name,
             min(depto) AS depto, min(secao) AS secao,
             min(grupo) AS grupo, min(subgrupo) AS subgrupo,
             sum(val_vda) AS val, sum(item_count)::bigint AS qty
      FROM public.sales_prod_daily_agg
      WHERE sale_date BETWEEN p_date_from AND p_date_to
        AND (COALESCE(array_length(p_stores,1),0)=0    OR store_code = ANY(p_stores))
        AND (COALESCE(array_length(p_deptos,1),0)=0    OR depto      = ANY(p_deptos))
        AND (COALESCE(array_length(p_secoes,1),0)=0    OR secao      = ANY(p_secoes))
        AND (COALESCE(array_length(p_grupos,1),0)=0    OR grupo      = ANY(p_grupos))
        AND (COALESCE(array_length(p_subgrupos,1),0)=0 OR subgrupo   = ANY(p_subgrupos))
        AND (COALESCE(array_length(p_prod_codes,1),0)=0 OR prod_code = ANY(p_prod_codes))
      GROUP BY prod_code
    ), universe AS (
      SELECT prod_code,
             min(prod_name) AS prod_name,
             min(depto) AS depto, min(secao) AS secao,
             min(grupo) AS grupo, min(subgrupo) AS subgrupo
      FROM public.sales_prod_daily_agg
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
        COALESCE(c.val, 0) AS val,
        COALESCE(c.qty, 0) AS qty
      FROM cur_agg c FULL OUTER JOIN universe u ON u.prod_code = c.prod_code
    ), last_sale AS (
      SELECT s.prod_code, max(s.sale_date) AS last_sale_date
      FROM public.sales_prod_daily_agg s
      WHERE s.prod_code IN (SELECT prod_code FROM joined)
        AND s.sale_date <= p_date_to
        AND (COALESCE(array_length(p_stores,1),0)=0 OR s.store_code = ANY(p_stores))
      GROUP BY s.prod_code
    )
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'prod_code', j.prod_code, 'prod_name', j.prod_name,
      'depto', j.depto, 'secao', j.secao, 'grupo', j.grupo, 'subgrupo', j.subgrupo,
      'val', j.val, 'qty', j.qty, 'lastSaleDate', ls.last_sale_date
    ) ORDER BY j.val DESC NULLS LAST, j.prod_code), '[]'::jsonb)
    INTO v_products
    FROM joined j LEFT JOIN last_sale ls ON ls.prod_code = j.prod_code;
  ELSE
    WITH cur_agg AS (
      SELECT prod_code,
             min(prod_name) AS prod_name,
             min(depto) AS depto, min(secao) AS secao,
             min(grupo) AS grupo, min(subgrupo) AS subgrupo,
             sum(val_vda) AS val, sum(item_count)::bigint AS qty
      FROM public.sales_prod_daily_agg
      WHERE sale_date BETWEEN p_date_from AND p_date_to
        AND (COALESCE(array_length(p_stores,1),0)=0    OR store_code = ANY(p_stores))
        AND (COALESCE(array_length(p_deptos,1),0)=0    OR depto      = ANY(p_deptos))
        AND (COALESCE(array_length(p_secoes,1),0)=0    OR secao      = ANY(p_secoes))
        AND (COALESCE(array_length(p_grupos,1),0)=0    OR grupo      = ANY(p_grupos))
        AND (COALESCE(array_length(p_subgrupos,1),0)=0 OR subgrupo   = ANY(p_subgrupos))
        AND (COALESCE(array_length(p_prod_codes,1),0)=0 OR prod_code = ANY(p_prod_codes))
      GROUP BY prod_code
    ), universe AS (
      SELECT prod_code,
             min(prod_name) AS prod_name,
             min(depto) AS depto, min(secao) AS secao,
             min(grupo) AS grupo, min(subgrupo) AS subgrupo
      FROM public.sales_prod_daily_agg
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
        COALESCE(c.val, 0) AS val,
        COALESCE(c.qty, 0) AS qty
      FROM cur_agg c FULL OUTER JOIN universe u ON u.prod_code = c.prod_code
    ), filtered AS (
      SELECT * FROM joined
      WHERE (p_search IS NULL OR p_search = ''
             OR prod_code ILIKE '%'||p_search||'%'
             OR prod_name ILIKE '%'||p_search||'%')
    ), last_sale AS (
      SELECT s.prod_code, max(s.sale_date) AS last_sale_date
      FROM public.sales_prod_daily_agg s
      WHERE s.prod_code IN (SELECT prod_code FROM filtered)
        AND s.sale_date <= p_date_to
        AND (COALESCE(array_length(p_stores,1),0)=0 OR s.store_code = ANY(p_stores))
      GROUP BY s.prod_code
    ), enriched AS (
      SELECT f.*, ls.last_sale_date
      FROM filtered f LEFT JOIN last_sale ls ON ls.prod_code = f.prod_code
    ), paged AS (
      SELECT * FROM enriched
      ORDER BY
        CASE WHEN p_sort_by = 'val'       AND p_sort_dir = 'desc' THEN val END DESC NULLS LAST,
        CASE WHEN p_sort_by = 'val'       AND p_sort_dir = 'asc'  THEN val END ASC  NULLS LAST,
        CASE WHEN p_sort_by = 'prod_code' AND p_sort_dir = 'desc' THEN prod_code END DESC,
        CASE WHEN p_sort_by = 'prod_code' AND p_sort_dir = 'asc'  THEN prod_code END ASC,
        CASE WHEN p_sort_by = 'prod_name' AND p_sort_dir = 'desc' THEN prod_name END DESC,
        CASE WHEN p_sort_by = 'prod_name' AND p_sort_dir = 'asc'  THEN prod_name END ASC,
        -- daysSince desc = mais dias sem venda primeiro (last_sale_date ASC, NULLs primeiro)
        CASE WHEN p_sort_by = 'daysSince' AND p_sort_dir = 'desc' THEN last_sale_date END ASC NULLS FIRST,
        CASE WHEN p_sort_by = 'daysSince' AND p_sort_dir = 'asc'  THEN last_sale_date END DESC NULLS LAST,
        prod_code
      LIMIT v_page_size OFFSET v_offset
    )
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'prod_code', p.prod_code, 'prod_name', p.prod_name,
      'depto', p.depto, 'secao', p.secao, 'grupo', p.grupo, 'subgrupo', p.subgrupo,
      'val', p.val, 'qty', p.qty, 'lastSaleDate', p.last_sale_date
    ) ORDER BY
        CASE WHEN p_sort_by = 'val'       AND p_sort_dir = 'desc' THEN p.val END DESC NULLS LAST,
        CASE WHEN p_sort_by = 'val'       AND p_sort_dir = 'asc'  THEN p.val END ASC  NULLS LAST,
        CASE WHEN p_sort_by = 'prod_code' AND p_sort_dir = 'desc' THEN p.prod_code END DESC,
        CASE WHEN p_sort_by = 'prod_code' AND p_sort_dir = 'asc'  THEN p.prod_code END ASC,
        CASE WHEN p_sort_by = 'prod_name' AND p_sort_dir = 'desc' THEN p.prod_name END DESC,
        CASE WHEN p_sort_by = 'prod_name' AND p_sort_dir = 'asc'  THEN p.prod_name END ASC,
        CASE WHEN p_sort_by = 'daysSince' AND p_sort_dir = 'desc' THEN p.last_sale_date END ASC NULLS FIRST,
        CASE WHEN p_sort_by = 'daysSince' AND p_sort_dir = 'asc'  THEN p.last_sale_date END DESC NULLS LAST,
        p.prod_code
    ), '[]'::jsonb)
    INTO v_products
    FROM paged p;
  END IF;

  RETURN jsonb_build_object(
    'total', v_total,
    'plusTotal', v_plus_total,
    'plusWithSale', v_plus_with_sale,
    'plusWithoutSale', GREATEST(v_plus_total - v_plus_with_sale, 0),
    'avgPerPlu', CASE WHEN v_plus_with_sale > 0 THEN v_total / v_plus_with_sale ELSE 0 END,
    'products', v_products,
    'byDate', '[]'::jsonb,
    'totalProducts', v_total_products,
    'page', v_page,
    'pageSize', v_page_size,
    'totalPages', CEIL(v_total_products::numeric / v_page_size)::int
  );
END;
$function$;
