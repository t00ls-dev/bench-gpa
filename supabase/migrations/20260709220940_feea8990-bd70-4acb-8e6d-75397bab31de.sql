
-- Fase 1: agregado por produto/dia para acelerar rankings de produto

CREATE TABLE IF NOT EXISTS public.sales_prod_daily_agg (
  sale_date  date not null,
  store_code text not null,
  store_name text not null,
  depto      text,
  secao      text,
  grupo      text,
  subgrupo   text,
  prod_code  text not null,
  prod_name  text not null,
  val_vda    numeric not null default 0,
  item_count integer not null default 0
);

GRANT SELECT ON public.sales_prod_daily_agg TO authenticated;
GRANT ALL ON public.sales_prod_daily_agg TO service_role;

ALTER TABLE public.sales_prod_daily_agg ENABLE ROW LEVEL SECURITY;

CREATE POLICY spda_select_active ON public.sales_prod_daily_agg
  FOR SELECT TO authenticated
  USING (public.is_active_user(auth.uid()));

CREATE POLICY spda_admin_all ON public.sales_prod_daily_agg
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX IF NOT EXISTS spda_date_idx        ON public.sales_prod_daily_agg (sale_date);
CREATE INDEX IF NOT EXISTS spda_date_prod_idx   ON public.sales_prod_daily_agg (sale_date, prod_code);
CREATE INDEX IF NOT EXISTS spda_date_store_idx  ON public.sales_prod_daily_agg (sale_date, store_code);
CREATE INDEX IF NOT EXISTS spda_hier_idx        ON public.sales_prod_daily_agg (depto, secao, grupo, subgrupo);
CREATE INDEX IF NOT EXISTS spda_prod_idx        ON public.sales_prod_daily_agg (prod_code);

-- Popular refresh de agregados (agora inclui sales_prod_daily_agg)
CREATE OR REPLACE FUNCTION public.refresh_sales_daily_agg(p_date date)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  DELETE FROM public.sales_daily_agg WHERE sale_date = p_date;
  INSERT INTO public.sales_daily_agg
    (sale_date, store_code, store_name, depto, secao, grupo, subgrupo, val_vda, item_count)
  SELECT sale_date, store_code, min(store_name),
         depto, secao, grupo, subgrupo, sum(val_vda), count(*)
  FROM public.sales WHERE sale_date = p_date
  GROUP BY sale_date, store_code, depto, secao, grupo, subgrupo;

  DELETE FROM public.sales_prod_daily_agg WHERE sale_date = p_date;
  INSERT INTO public.sales_prod_daily_agg
    (sale_date, store_code, store_name, depto, secao, grupo, subgrupo, prod_code, prod_name, val_vda, item_count)
  SELECT sale_date, store_code, min(store_name),
         depto, secao, grupo, subgrupo, prod_code, min(prod_name),
         sum(val_vda), count(*)
  FROM public.sales WHERE sale_date = p_date
  GROUP BY sale_date, store_code, depto, secao, grupo, subgrupo, prod_code;

  PERFORM public.refresh_filter_hierarchy();
END;
$function$;

-- Backfill: popular para todas as datas já importadas
INSERT INTO public.sales_prod_daily_agg
  (sale_date, store_code, store_name, depto, secao, grupo, subgrupo, prod_code, prod_name, val_vda, item_count)
SELECT sale_date, store_code, min(store_name),
       depto, secao, grupo, subgrupo, prod_code, min(prod_name),
       sum(val_vda), count(*)
FROM public.sales
GROUP BY sale_date, store_code, depto, secao, grupo, subgrupo, prod_code;

-- Reescrever dashboard_rankings.byProduto para usar sales_prod_daily_agg
CREATE OR REPLACE FUNCTION public.dashboard_rankings(p_date_from date, p_date_to date, p_stores text[] DEFAULT '{}'::text[], p_deptos text[] DEFAULT '{}'::text[], p_secoes text[] DEFAULT '{}'::text[], p_grupos text[] DEFAULT '{}'::text[], p_subgrupos text[] DEFAULT '{}'::text[], p_limit integer DEFAULT 10)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  v_depto jsonb; v_secao jsonb; v_grupo jsonb; v_subgrupo jsonb; v_produto jsonb;
BEGIN
  IF NOT public.is_active_user(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  WITH f AS (
    SELECT * FROM public.sales_daily_agg
    WHERE (p_date_from IS NULL OR sale_date >= p_date_from)
      AND (p_date_to IS NULL OR sale_date <= p_date_to)
      AND (coalesce(array_length(p_stores,1),0)=0    OR store_code = ANY(p_stores))
      AND (coalesce(array_length(p_deptos,1),0)=0    OR depto      = ANY(p_deptos))
      AND (coalesce(array_length(p_secoes,1),0)=0    OR secao      = ANY(p_secoes))
      AND (coalesce(array_length(p_grupos,1),0)=0    OR grupo      = ANY(p_grupos))
      AND (coalesce(array_length(p_subgrupos,1),0)=0 OR subgrupo   = ANY(p_subgrupos))
  )
  SELECT
    coalesce((SELECT jsonb_agg(jsonb_build_object('name', name, 'val', v) ORDER BY v DESC)
              FROM (SELECT coalesce(depto,'(sem)') name, sum(val_vda) v FROM f GROUP BY depto ORDER BY 2 DESC LIMIT p_limit) x),'[]'::jsonb),
    coalesce((SELECT jsonb_agg(jsonb_build_object('name', name, 'val', v) ORDER BY v DESC)
              FROM (SELECT coalesce(secao,'(sem)') name, sum(val_vda) v FROM f GROUP BY secao ORDER BY 2 DESC LIMIT p_limit) x),'[]'::jsonb),
    coalesce((SELECT jsonb_agg(jsonb_build_object('name', name, 'val', v) ORDER BY v DESC)
              FROM (SELECT coalesce(grupo,'(sem)') name, sum(val_vda) v FROM f GROUP BY grupo ORDER BY 2 DESC LIMIT p_limit) x),'[]'::jsonb),
    coalesce((SELECT jsonb_agg(jsonb_build_object('name', name, 'val', v) ORDER BY v DESC)
              FROM (SELECT coalesce(subgrupo,'(sem)') name, sum(val_vda) v FROM f GROUP BY subgrupo ORDER BY 2 DESC LIMIT p_limit) x),'[]'::jsonb),
    '[]'::jsonb
  INTO v_depto, v_secao, v_grupo, v_subgrupo, v_produto;

  WITH fp AS (
    SELECT * FROM public.sales_prod_daily_agg
    WHERE (p_date_from IS NULL OR sale_date >= p_date_from)
      AND (p_date_to IS NULL OR sale_date <= p_date_to)
      AND (coalesce(array_length(p_stores,1),0)=0    OR store_code = ANY(p_stores))
      AND (coalesce(array_length(p_deptos,1),0)=0    OR depto      = ANY(p_deptos))
      AND (coalesce(array_length(p_secoes,1),0)=0    OR secao      = ANY(p_secoes))
      AND (coalesce(array_length(p_grupos,1),0)=0    OR grupo      = ANY(p_grupos))
      AND (coalesce(array_length(p_subgrupos,1),0)=0 OR subgrupo   = ANY(p_subgrupos))
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object('code', prod_code, 'name', prod_name, 'val', v) ORDER BY v DESC),'[]'::jsonb)
  INTO v_produto
  FROM (SELECT prod_code, min(prod_name) prod_name, sum(val_vda) v
        FROM fp GROUP BY prod_code ORDER BY 3 DESC LIMIT p_limit) x;

  RETURN jsonb_build_object(
    'byDepto', v_depto, 'bySecao', v_secao,
    'byGrupo', v_grupo, 'bySubgrupo', v_subgrupo,
    'byProduto', v_produto
  );
END $function$;

-- ============================================================
-- Fase 2: area_analysis com paginação real (LIMIT/OFFSET antes de last_sale)
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_sales_prod_store_date
  ON public.sales (prod_code, store_code, sale_date DESC);

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

  -- Agregação no período (usa spda: agregado por produto/dia)
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
    -- Sem paginação: retorna tudo com last_sale para o universo inteiro
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
    -- Com paginação: pagina PRIMEIRO, depois calcula last_sale só da página
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
    ), paged AS (
      SELECT * FROM filtered
      ORDER BY
        CASE WHEN p_sort_by = 'val'       AND p_sort_dir = 'desc' THEN val END DESC NULLS LAST,
        CASE WHEN p_sort_by = 'val'       AND p_sort_dir = 'asc'  THEN val END ASC  NULLS LAST,
        CASE WHEN p_sort_by = 'prod_code' AND p_sort_dir = 'desc' THEN prod_code END DESC,
        CASE WHEN p_sort_by = 'prod_code' AND p_sort_dir = 'asc'  THEN prod_code END ASC,
        CASE WHEN p_sort_by = 'prod_name' AND p_sort_dir = 'desc' THEN prod_name END DESC,
        CASE WHEN p_sort_by = 'prod_name' AND p_sort_dir = 'asc'  THEN prod_name END ASC,
        prod_code
      LIMIT v_page_size OFFSET v_offset
    ), last_sale AS (
      SELECT s.prod_code, max(s.sale_date) AS last_sale_date
      FROM public.sales_prod_daily_agg s
      WHERE s.prod_code IN (SELECT prod_code FROM paged)
        AND s.sale_date <= p_date_to
        AND (COALESCE(array_length(p_stores,1),0)=0 OR s.store_code = ANY(p_stores))
      GROUP BY s.prod_code
    )
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'prod_code', p.prod_code, 'prod_name', p.prod_name,
      'depto', p.depto, 'secao', p.secao, 'grupo', p.grupo, 'subgrupo', p.subgrupo,
      'val', p.val, 'qty', p.qty, 'lastSaleDate', ls.last_sale_date
    )), '[]'::jsonb)
    INTO v_products
    FROM paged p LEFT JOIN last_sale ls ON ls.prod_code = p.prod_code;
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

-- ============================================================
-- Fase 3: product_analysis consolidando agg_all em um único CTE
-- ============================================================
CREATE OR REPLACE FUNCTION public.product_analysis(p_prod_code text, p_store_code text DEFAULT NULL::text, p_ref_date date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  v_ref date; v_ref_val numeric;
  v_prod jsonb; v_by_store jsonb; v_evolution jsonb;
  v_same_wd jsonb; v_all_last jsonb; v_ref_dow int;
BEGIN
  IF NOT public.is_active_user(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;

  IF p_ref_date IS NULL THEN
    SELECT max(sale_date) INTO v_ref FROM public.sales_prod_daily_agg
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
      SELECT s.depto, s.secao, s.grupo, s.subgrupo FROM public.sales_prod_daily_agg s
      WHERE s.prod_code = p.prod_code ORDER BY s.sale_date DESC LIMIT 1
    ) h ON true
    WHERE p.prod_code = p_prod_code;

  IF v_ref IS NULL THEN
    RETURN jsonb_build_object('product', v_prod, 'refDate', NULL, 'refValue', 0,
      'byStore','[]'::jsonb,'evolution','[]'::jsonb,
      'lastFourSameWeekday','[]'::jsonb,'lastFourAll','[]'::jsonb);
  END IF;

  v_ref_dow := EXTRACT(DOW FROM v_ref)::int;

  SELECT coalesce(sum(val_vda),0) INTO v_ref_val FROM public.sales_prod_daily_agg
   WHERE prod_code = p_prod_code AND sale_date = v_ref
     AND (p_store_code IS NULL OR store_code = p_store_code);

  SELECT coalesce(jsonb_agg(jsonb_build_object('code',store_code,'name',store_name,'val',val) ORDER BY val DESC),'[]'::jsonb)
    INTO v_by_store FROM (
      SELECT store_code, min(store_name) AS store_name, sum(val_vda) AS val
      FROM public.sales_prod_daily_agg WHERE prod_code = p_prod_code AND sale_date = v_ref
        AND (p_store_code IS NULL OR store_code = p_store_code)
      GROUP BY store_code
    ) t;

  -- 1 único CTE agg_all reutilizado pelas 3 seleções
  WITH agg_all AS (
    SELECT sale_date, sum(val_vda) AS val FROM public.sales_prod_daily_agg
    WHERE prod_code = p_prod_code AND (p_store_code IS NULL OR store_code = p_store_code)
    GROUP BY sale_date
  ), evo AS (
    SELECT sale_date, val FROM agg_all ORDER BY sale_date DESC LIMIT 60
  ), same_wd AS (
    SELECT sale_date, val FROM agg_all
    WHERE sale_date < v_ref AND EXTRACT(DOW FROM sale_date)::int = v_ref_dow
    ORDER BY sale_date DESC LIMIT 4
  ), last_all AS (
    SELECT sale_date, val FROM agg_all
    WHERE sale_date < v_ref
    ORDER BY sale_date DESC LIMIT 4
  )
  SELECT
    coalesce((SELECT jsonb_agg(jsonb_build_object('date',sale_date,'val',val) ORDER BY sale_date) FROM evo),'[]'::jsonb),
    coalesce((SELECT jsonb_agg(jsonb_build_object('date',sale_date,'val',val) ORDER BY sale_date) FROM same_wd),'[]'::jsonb),
    coalesce((SELECT jsonb_agg(jsonb_build_object('date',sale_date,'val',val) ORDER BY sale_date) FROM last_all),'[]'::jsonb)
  INTO v_evolution, v_same_wd, v_all_last;

  RETURN jsonb_build_object(
    'product', v_prod, 'refDate', v_ref, 'refValue', v_ref_val,
    'byStore', v_by_store, 'evolution', v_evolution,
    'lastFourSameWeekday', v_same_wd, 'lastFourAll', v_all_last
  );
END;
$function$;
