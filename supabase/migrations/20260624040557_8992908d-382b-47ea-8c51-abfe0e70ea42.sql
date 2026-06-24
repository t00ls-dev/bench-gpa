
-- Convert public-facing RPCs from SECURITY DEFINER to SECURITY INVOKER.
-- RLS policies on sales / sales_daily_agg / products / import_log / profiles / user_roles
-- already restrict reads to approved users via is_approved(auth.uid()) and self-id checks,
-- so behavior is preserved while removing the definer-bypass surface.

-- has_role: self-readable via user_roles RLS (user_id = auth.uid())
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY INVOKER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$function$;

-- is_approved: self-readable via profiles RLS (id = auth.uid())
CREATE OR REPLACE FUNCTION public.is_approved(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY INVOKER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = _user_id AND status = 'approved')
$function$;

-- imported_dates: relies on import_log RLS
CREATE OR REPLACE FUNCTION public.imported_dates()
RETURNS TABLE(sale_date date, row_count integer, imported_at timestamp with time zone)
LANGUAGE sql
STABLE SECURITY INVOKER
SET search_path TO 'public'
AS $function$
  SELECT sale_date, row_count, imported_at
  FROM public.import_log
  ORDER BY sale_date DESC;
$function$;

-- product_search: relies on products RLS
CREATE OR REPLACE FUNCTION public.product_search(p_q text)
RETURNS TABLE(prod_code text, prod_name text)
LANGUAGE sql
STABLE SECURITY INVOKER
SET search_path TO 'public'
AS $function$
  SELECT prod_code, prod_name FROM public.products
  WHERE (prod_name ILIKE '%'||p_q||'%' OR prod_code ILIKE '%'||p_q||'%')
  ORDER BY prod_name LIMIT 20;
$function$;

-- dashboard_metrics: queries sales_daily_agg (RLS enforced)
CREATE OR REPLACE FUNCTION public.dashboard_metrics(p_date_from date, p_date_to date, p_stores text[] DEFAULT '{}'::text[], p_deptos text[] DEFAULT '{}'::text[], p_secoes text[] DEFAULT '{}'::text[], p_grupos text[] DEFAULT '{}'::text[], p_subgrupos text[] DEFAULT '{}'::text[])
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY INVOKER
SET search_path TO 'public'
AS $function$
DECLARE
  v_total numeric; v_count bigint;
  v_by_store jsonb; v_by_depto jsonb; v_by_date jsonb;
BEGIN
  WITH f AS (
    SELECT * FROM public.sales_daily_agg
    WHERE (p_date_from IS NULL OR sale_date >= p_date_from)
      AND (p_date_to   IS NULL OR sale_date <= p_date_to)
      AND (coalesce(array_length(p_stores,1),0)=0    OR store_code = ANY(p_stores))
      AND (coalesce(array_length(p_deptos,1),0)=0    OR depto      = ANY(p_deptos))
      AND (coalesce(array_length(p_secoes,1),0)=0    OR secao      = ANY(p_secoes))
      AND (coalesce(array_length(p_grupos,1),0)=0    OR grupo      = ANY(p_grupos))
      AND (coalesce(array_length(p_subgrupos,1),0)=0 OR subgrupo   = ANY(p_subgrupos))
  )
  SELECT
    coalesce(sum(val_vda),0), coalesce(sum(item_count),0)::bigint,
    coalesce((SELECT jsonb_agg(jsonb_build_object('code',store_code,'name',store_name,'val',v) ORDER BY v DESC)
              FROM (SELECT store_code, min(store_name) store_name, sum(val_vda) v FROM f GROUP BY store_code) s),'[]'::jsonb),
    coalesce((SELECT jsonb_agg(jsonb_build_object('name',name,'val',v) ORDER BY v DESC)
              FROM (SELECT coalesce(depto,'(sem departamento)') name, sum(val_vda) v FROM f GROUP BY depto) d),'[]'::jsonb),
    coalesce((SELECT jsonb_agg(jsonb_build_object('date',sale_date,'val',v) ORDER BY sale_date)
              FROM (SELECT sale_date, sum(val_vda) v FROM f GROUP BY sale_date) g),'[]'::jsonb)
  INTO v_total, v_count, v_by_store, v_by_depto, v_by_date FROM f;
  RETURN jsonb_build_object('total',v_total,'count',v_count,'byStore',v_by_store,'byDepto',v_by_depto,'byDate',v_by_date);
END;
$function$;

-- filter_options
CREATE OR REPLACE FUNCTION public.filter_options(p_date_from date, p_date_to date, p_stores text[] DEFAULT '{}'::text[], p_deptos text[] DEFAULT '{}'::text[], p_secoes text[] DEFAULT '{}'::text[], p_grupos text[] DEFAULT '{}'::text[])
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY INVOKER
SET search_path TO 'public'
AS $function$
DECLARE
  v_latest date;
  v_stores jsonb; v_deptos jsonb; v_secoes jsonb; v_grupos jsonb; v_subgrupos jsonb;
  v_available jsonb;
BEGIN
  SELECT coalesce(jsonb_agg(DISTINCT sale_date ORDER BY sale_date), '[]'::jsonb)
    INTO v_available
  FROM public.sales_daily_agg
  WHERE (coalesce(array_length(p_stores,1),0)=0 OR store_code=ANY(p_stores))
    AND (coalesce(array_length(p_deptos,1),0)=0 OR depto=ANY(p_deptos))
    AND (coalesce(array_length(p_secoes,1),0)=0 OR secao=ANY(p_secoes))
    AND (coalesce(array_length(p_grupos,1),0)=0 OR grupo=ANY(p_grupos));

  SELECT max((d)::date) INTO v_latest
  FROM jsonb_array_elements_text(v_available) d;

  WITH f AS (SELECT * FROM public.sales_daily_agg
    WHERE (p_date_from IS NULL OR sale_date >= p_date_from)
      AND (p_date_to   IS NULL OR sale_date <= p_date_to))
  SELECT
    coalesce((SELECT jsonb_agg(jsonb_build_object('store_code',store_code,'store_name',store_name) ORDER BY store_name)
              FROM (SELECT store_code, min(store_name) store_name FROM f
                    WHERE (coalesce(array_length(p_deptos,1),0)=0 OR depto=ANY(p_deptos))
                      AND (coalesce(array_length(p_secoes,1),0)=0 OR secao=ANY(p_secoes))
                      AND (coalesce(array_length(p_grupos,1),0)=0 OR grupo=ANY(p_grupos))
                    GROUP BY store_code) s),'[]'::jsonb),
    coalesce((SELECT jsonb_agg(DISTINCT depto ORDER BY depto) FILTER (WHERE depto IS NOT NULL) FROM f
              WHERE (coalesce(array_length(p_stores,1),0)=0 OR store_code=ANY(p_stores))
                AND (coalesce(array_length(p_secoes,1),0)=0 OR secao=ANY(p_secoes))
                AND (coalesce(array_length(p_grupos,1),0)=0 OR grupo=ANY(p_grupos))),'[]'::jsonb),
    coalesce((SELECT jsonb_agg(DISTINCT secao ORDER BY secao) FILTER (WHERE secao IS NOT NULL) FROM f
              WHERE (coalesce(array_length(p_stores,1),0)=0 OR store_code=ANY(p_stores))
                AND (coalesce(array_length(p_deptos,1),0)=0 OR depto=ANY(p_deptos))
                AND (coalesce(array_length(p_grupos,1),0)=0 OR grupo=ANY(p_grupos))),'[]'::jsonb),
    coalesce((SELECT jsonb_agg(DISTINCT grupo ORDER BY grupo) FILTER (WHERE grupo IS NOT NULL) FROM f
              WHERE (coalesce(array_length(p_stores,1),0)=0 OR store_code=ANY(p_stores))
                AND (coalesce(array_length(p_deptos,1),0)=0 OR depto=ANY(p_deptos))
                AND (coalesce(array_length(p_secoes,1),0)=0 OR secao=ANY(p_secoes))),'[]'::jsonb),
    coalesce((SELECT jsonb_agg(DISTINCT subgrupo ORDER BY subgrupo) FILTER (WHERE subgrupo IS NOT NULL) FROM f
              WHERE (coalesce(array_length(p_stores,1),0)=0 OR store_code=ANY(p_stores))
                AND (coalesce(array_length(p_deptos,1),0)=0 OR depto=ANY(p_deptos))
                AND (coalesce(array_length(p_secoes,1),0)=0 OR secao=ANY(p_secoes))
                AND (coalesce(array_length(p_grupos,1),0)=0 OR grupo=ANY(p_grupos))),'[]'::jsonb)
  INTO v_stores, v_deptos, v_secoes, v_grupos, v_subgrupos;

  RETURN jsonb_build_object('latestDate',v_latest,'stores',v_stores,'deptos',v_deptos,
    'secoes',v_secoes,'grupos',v_grupos,'subgrupos',v_subgrupos,'availableDates',v_available);
END;
$function$;

-- dashboard_rankings
CREATE OR REPLACE FUNCTION public.dashboard_rankings(p_date_from date, p_date_to date, p_stores text[] DEFAULT '{}'::text[], p_deptos text[] DEFAULT '{}'::text[], p_secoes text[] DEFAULT '{}'::text[], p_grupos text[] DEFAULT '{}'::text[], p_subgrupos text[] DEFAULT '{}'::text[], p_limit integer DEFAULT 10)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY INVOKER
SET search_path TO 'public'
AS $function$
DECLARE
  v_depto jsonb; v_secao jsonb; v_grupo jsonb; v_subgrupo jsonb; v_produto jsonb;
BEGIN
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
    SELECT * FROM public.sales
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

-- area_analysis
CREATE OR REPLACE FUNCTION public.area_analysis(p_date_from date, p_date_to date, p_stores text[] DEFAULT '{}'::text[], p_deptos text[] DEFAULT '{}'::text[], p_secoes text[] DEFAULT '{}'::text[], p_grupos text[] DEFAULT '{}'::text[], p_subgrupos text[] DEFAULT '{}'::text[], p_prod_codes text[] DEFAULT '{}'::text[])
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY INVOKER
SET search_path TO 'public'
AS $function$
DECLARE
  v_total numeric;
  v_plus_total bigint;
  v_plus_with_sale bigint;
  v_products jsonb;
  v_by_date jsonb;
BEGIN
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
$function$;

-- product_analysis
CREATE OR REPLACE FUNCTION public.product_analysis(p_prod_code text, p_store_code text DEFAULT NULL::text, p_ref_date date DEFAULT NULL::date)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY INVOKER
SET search_path TO 'public'
AS $function$
DECLARE
  v_ref date;
  v_ref_val numeric;
  v_prod jsonb;
  v_by_store jsonb;
  v_evolution jsonb;
  v_same_wd jsonb;
  v_all_last jsonb;
  v_ref_dow int;
BEGIN
  IF p_ref_date IS NULL THEN
    SELECT max(sale_date) INTO v_ref FROM public.sales
     WHERE prod_code = p_prod_code
       AND (p_store_code IS NULL OR store_code = p_store_code);
  ELSE
    v_ref := p_ref_date;
  END IF;

  SELECT jsonb_build_object('prod_code',prod_code,'prod_name',prod_name) INTO v_prod
    FROM public.products WHERE prod_code = p_prod_code;

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

  WITH agg AS (
    SELECT sale_date, sum(val_vda) AS val
    FROM public.sales WHERE prod_code = p_prod_code
      AND (p_store_code IS NULL OR store_code = p_store_code)
    GROUP BY sale_date
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object('date',sale_date,'val',val) ORDER BY sale_date),'[]'::jsonb)
    INTO v_evolution FROM agg;

  WITH agg AS (
    SELECT sale_date, sum(val_vda) AS val
    FROM public.sales WHERE prod_code = p_prod_code
      AND (p_store_code IS NULL OR store_code = p_store_code)
      AND sale_date < v_ref
    GROUP BY sale_date
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object('date',sale_date,'val',val) ORDER BY sale_date),'[]'::jsonb)
    INTO v_same_wd FROM (
      SELECT * FROM agg WHERE EXTRACT(DOW FROM sale_date)::int = v_ref_dow
      ORDER BY sale_date DESC LIMIT 4
    ) x;

  WITH agg AS (
    SELECT sale_date, sum(val_vda) AS val
    FROM public.sales WHERE prod_code = p_prod_code
      AND (p_store_code IS NULL OR store_code = p_store_code)
      AND sale_date < v_ref
    GROUP BY sale_date
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object('date',sale_date,'val',val) ORDER BY sale_date),'[]'::jsonb)
    INTO v_all_last FROM (SELECT * FROM agg ORDER BY sale_date DESC LIMIT 4) x;

  RETURN jsonb_build_object(
    'product', v_prod,
    'refDate', v_ref,
    'refValue', v_ref_val,
    'byStore', v_by_store,
    'evolution', v_evolution,
    'lastFourSameWeekday', v_same_wd,
    'lastFourAll', v_all_last
  );
END;
$function$;

-- products_in_decline
CREATE OR REPLACE FUNCTION public.products_in_decline(p_date_from date, p_date_to date, p_stores text[] DEFAULT '{}'::text[], p_deptos text[] DEFAULT '{}'::text[], p_secoes text[] DEFAULT '{}'::text[], p_prod_codes text[] DEFAULT '{}'::text[])
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY INVOKER
SET search_path TO 'public'
AS $function$
DECLARE
  v_result jsonb;
  v_hist_from date;
BEGIN
  v_hist_from := p_date_from - INTERVAL '30 days';

  WITH recent AS (
    SELECT store_code, min(store_name) store_name, prod_code, min(prod_name) prod_name,
           min(depto) depto, min(secao) secao,
           sum(val_vda) sum_recent,
           count(DISTINCT sale_date) FILTER (WHERE val_vda > 0) days_with_sale_recent,
           max(sale_date) FILTER (WHERE val_vda > 0) last_sale_recent
    FROM public.sales
    WHERE sale_date BETWEEN p_date_from AND p_date_to
      AND (coalesce(array_length(p_stores,1),0)=0 OR store_code = ANY(p_stores))
      AND (coalesce(array_length(p_deptos,1),0)=0 OR depto = ANY(p_deptos))
      AND (coalesce(array_length(p_secoes,1),0)=0 OR secao = ANY(p_secoes))
      AND (coalesce(array_length(p_prod_codes,1),0)=0 OR prod_code = ANY(p_prod_codes))
    GROUP BY store_code, prod_code
  ),
  hist AS (
    SELECT store_code, prod_code,
           sum(val_vda) sum_hist,
           count(DISTINCT sale_date) FILTER (WHERE val_vda > 0) days_with_sale_hist,
           max(sale_date) FILTER (WHERE val_vda > 0) last_sale_hist
    FROM public.sales
    WHERE sale_date BETWEEN v_hist_from AND (p_date_from - INTERVAL '1 day')
    GROUP BY store_code, prod_code
  ),
  base AS (
    SELECT
      coalesce(r.store_code, h.store_code) AS store_code,
      r.store_name, r.prod_name, r.depto, r.secao,
      coalesce(r.prod_code, h.prod_code) AS prod_code,
      coalesce(r.sum_recent, 0) AS sum_recent,
      coalesce(r.days_with_sale_recent, 0) AS days_with_sale_recent,
      coalesce(h.sum_hist, 0) AS sum_hist,
      coalesce(h.days_with_sale_hist, 0) AS days_with_sale_hist,
      greatest(r.last_sale_recent, h.last_sale_hist) AS last_sale,
      (p_date_to - p_date_from + 1) AS days_recent_window,
      (p_date_from - v_hist_from) AS days_hist_window
    FROM recent r
    FULL OUTER JOIN hist h USING (store_code, prod_code)
    WHERE coalesce(h.days_with_sale_hist,0) >= 5
  ),
  enriched AS (
    SELECT b.*,
           (b.sum_hist / NULLIF(b.days_hist_window,0)) AS avg_daily_hist,
           (b.sum_recent / NULLIF(b.days_recent_window,0)) AS avg_daily_recent,
           (p_date_to - b.last_sale) AS days_without_sale
    FROM base b
  ),
  classified AS (
    SELECT e.*,
      CASE
        WHEN avg_daily_hist IS NULL OR avg_daily_hist = 0 THEN NULL
        ELSE ((avg_daily_recent - avg_daily_hist) / avg_daily_hist)
      END AS variation
    FROM enriched e
  ),
  final AS (
    SELECT c.*,
      CASE
        WHEN sum_recent = 0 AND days_with_sale_hist >= 5 THEN 'critico'
        WHEN variation IS NOT NULL AND variation <= -0.7 THEN 'alerta'
        WHEN variation IS NOT NULL AND variation <= -0.4 THEN 'atencao'
        ELSE 'ok'
      END AS status
    FROM classified c
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'store_code', store_code,
    'store_name', store_name,
    'prod_code', prod_code,
    'prod_name', prod_name,
    'depto', depto,
    'secao', secao,
    'avg_daily_hist', avg_daily_hist,
    'avg_daily_recent', avg_daily_recent,
    'sum_recent', sum_recent,
    'sum_hist', sum_hist,
    'variation', variation,
    'days_without_sale', days_without_sale,
    'last_sale_date', last_sale,
    'status', status
  ) ORDER BY
    CASE status WHEN 'critico' THEN 0 WHEN 'alerta' THEN 1 WHEN 'atencao' THEN 2 ELSE 4 END,
    variation NULLS LAST
  ), '[]'::jsonb) INTO v_result
  FROM final
  WHERE status IN ('critico','alerta','atencao');

  RETURN v_result;
END;
$function$;
