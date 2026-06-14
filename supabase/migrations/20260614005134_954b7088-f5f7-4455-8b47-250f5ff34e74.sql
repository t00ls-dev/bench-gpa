
DROP FUNCTION IF EXISTS public.stock_at(date, text, text);
DROP FUNCTION IF EXISTS public.product_stock_history(text, text);
DROP FUNCTION IF EXISTS public.imported_stock_dates();
DROP FUNCTION IF EXISTS public.products_in_decline(date, date, text[], text[], text[], text[]);
DROP TABLE IF EXISTS public.stock_import_log;
DROP TABLE IF EXISTS public.stock;

CREATE OR REPLACE FUNCTION public.products_in_decline(
  p_date_from date,
  p_date_to date,
  p_stores text[] DEFAULT '{}'::text[],
  p_deptos text[] DEFAULT '{}'::text[],
  p_secoes text[] DEFAULT '{}'::text[],
  p_prod_codes text[] DEFAULT '{}'::text[]
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_result jsonb;
  v_hist_from date;
BEGIN
  IF NOT public.is_approved(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

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
