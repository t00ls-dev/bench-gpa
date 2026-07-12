
-- =====================================================================
-- Elimina dependência da tabela public.sales
-- finalize_import: popula sales_daily_agg + sales_prod_daily_agg
--   diretamente de staging_sales, sem passar por sales
-- refresh_sales_daily_agg: lê de staging_sales em vez de sales
-- products_in_decline: migrado para sales_prod_daily_agg
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. finalize_import: swap direto para agregados, sem sales
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.finalize_import(
  p_batch_id UUID,
  p_sale_date DATE,
  p_row_count INTEGER,
  p_imported_by UUID
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  -- Valida staging
  SELECT COUNT(*) INTO v_count
  FROM public.staging_sales WHERE batch_id = p_batch_id;
  IF v_count != p_row_count THEN
    RAISE EXCEPTION 'staging count mismatch: expected %, got %', p_row_count, v_count;
  END IF;

  -- Deleta agregações antigas da data
  DELETE FROM public.sales_daily_agg WHERE sale_date = p_sale_date;
  DELETE FROM public.sales_prod_daily_agg WHERE sale_date = p_sale_date;

  -- Popula sales_daily_agg direto da staging
  INSERT INTO public.sales_daily_agg
    (sale_date, store_code, store_name, depto, secao, grupo, subgrupo, val_vda, item_count)
  SELECT sale_date, store_code, min(store_name),
         depto, secao, grupo, subgrupo, sum(val_vda), count(*)
  FROM public.staging_sales
  WHERE batch_id = p_batch_id
  GROUP BY sale_date, store_code, depto, secao, grupo, subgrupo;

  -- Popula sales_prod_daily_agg direto da staging
  INSERT INTO public.sales_prod_daily_agg
    (sale_date, store_code, store_name, depto, secao, grupo, subgrupo, prod_code, prod_name, val_vda, item_count)
  SELECT sale_date, store_code, min(store_name),
         depto, secao, grupo, subgrupo, prod_code, min(prod_name),
         sum(val_vda), count(*)
  FROM public.staging_sales
  WHERE batch_id = p_batch_id
  GROUP BY sale_date, store_code, depto, secao, grupo, subgrupo, prod_code;

  -- Limpa staging
  DELETE FROM public.staging_sales WHERE batch_id = p_batch_id OR sale_date = p_sale_date;

  -- Registra no log
  INSERT INTO public.import_log (sale_date, row_count, imported_at, imported_by)
  VALUES (p_sale_date, p_row_count, now(), p_imported_by)
  ON CONFLICT (sale_date) DO UPDATE SET
    row_count = EXCLUDED.row_count,
    imported_at = EXCLUDED.imported_at,
    imported_by = EXCLUDED.imported_by;

  -- Atualiza hierarquia
  PERFORM public.refresh_filter_hierarchy();

  RETURN jsonb_build_object('ok', true, 'rows', v_count);
END;
$$;

-- ---------------------------------------------------------------------
-- 2. refresh_sales_daily_agg: lê de staging_sales em vez de sales
--    (usado para admin/maintenance em datas onde staging ainda existe)
-- ---------------------------------------------------------------------
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
  FROM public.staging_sales WHERE sale_date = p_date
  GROUP BY sale_date, store_code, depto, secao, grupo, subgrupo;

  DELETE FROM public.sales_prod_daily_agg WHERE sale_date = p_date;
  INSERT INTO public.sales_prod_daily_agg
    (sale_date, store_code, store_name, depto, secao, grupo, subgrupo, prod_code, prod_name, val_vda, item_count)
  SELECT sale_date, store_code, min(store_name),
         depto, secao, grupo, subgrupo, prod_code, min(prod_name),
         sum(val_vda), count(*)
  FROM public.staging_sales WHERE sale_date = p_date
  GROUP BY sale_date, store_code, depto, secao, grupo, subgrupo, prod_code;

  PERFORM public.refresh_filter_hierarchy();
END;
$function$;

-- ---------------------------------------------------------------------
-- 3. products_in_decline: migrado de sales para sales_prod_daily_agg
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.products_in_decline(
  p_date_from date,
  p_date_to date,
  p_stores text[] DEFAULT '{}'::text[],
  p_deptos text[] DEFAULT '{}'::text[],
  p_secoes text[] DEFAULT '{}'::text[],
  p_grupos text[] DEFAULT '{}'::text[],
  p_subgrupos text[] DEFAULT '{}'::text[],
  p_hist_days integer DEFAULT 30,
  p_min_val_vda numeric DEFAULT 1000,
  p_limit integer DEFAULT 20
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = 'public'
AS $function$
DECLARE
  v_hist_from date;
  v_records jsonb;
BEGIN
  IF NOT public.is_active_user(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;

  v_hist_from := p_date_from - p_hist_days;

  WITH recent AS (
    SELECT store_code, prod_code,
           sum(val_vda) sum_recent,
           count(DISTINCT sale_date) days_recent
    FROM public.sales_prod_daily_agg
    WHERE sale_date BETWEEN p_date_from AND p_date_to
      AND (coalesce(array_length(p_stores,1),0)=0    OR store_code = ANY(p_stores))
      AND (coalesce(array_length(p_deptos,1),0)=0    OR depto      = ANY(p_deptos))
      AND (coalesce(array_length(p_secoes,1),0)=0    OR secao      = ANY(p_secoes))
      AND (coalesce(array_length(p_grupos,1),0)=0    OR grupo      = ANY(p_grupos))
      AND (coalesce(array_length(p_subgrupos,1),0)=0 OR subgrupo   = ANY(p_subgrupos))
    GROUP BY store_code, prod_code
  ),
  hist AS (
    SELECT store_code, prod_code,
           sum(val_vda) sum_hist,
           count(DISTINCT sale_date) days_hist
    FROM public.sales_prod_daily_agg
    WHERE sale_date BETWEEN v_hist_from AND (p_date_from - 1)
      AND (coalesce(array_length(p_stores,1),0)=0    OR store_code = ANY(p_stores))
      AND (coalesce(array_length(p_deptos,1),0)=0    OR depto      = ANY(p_deptos))
      AND (coalesce(array_length(p_secoes,1),0)=0    OR secao      = ANY(p_secoes))
      AND (coalesce(array_length(p_grupos,1),0)=0    OR grupo      = ANY(p_grupos))
      AND (coalesce(array_length(p_subgrupos,1),0)=0 OR subgrupo   = ANY(p_subgrupos))
    GROUP BY store_code, prod_code
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'store_code', r.store_code,
    'prod_code', r.prod_code,
    'sum_recent', r.sum_recent,
    'days_recent', r.days_recent,
    'sum_hist', coalesce(h.sum_hist,0),
    'days_hist', coalesce(h.days_hist,0)
  ) ORDER BY r.sum_recent DESC), '[]'::jsonb)
  INTO v_records
  FROM recent r
  LEFT JOIN hist h ON r.store_code = h.store_code AND r.prod_code = h.prod_code
  WHERE r.sum_recent >= p_min_val_vda;

  RETURN v_records;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.products_in_decline(date,date,text[],text[],text[],text[],text[],integer,numeric,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.products_in_decline(date,date,text[],text[],text[],text[],text[],integer,numeric,integer) TO authenticated;

