-- Incorpora purge de agregados antigos no finalize_import
-- Remove a necessidade de chamada separada purgeOldAggs() após cada import
-- A lógica mantém ~28 dias (4 datas por dia-da-semana)

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
  v_total integer;
  v_dates date[];
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

  -- Purge agregados antigos (mantém ~28 dias = 4 por dia-da-semana)
  SELECT COUNT(*) INTO v_total
  FROM (SELECT DISTINCT sale_date FROM public.sales_prod_daily_agg) t;

  IF v_total >= 28 THEN
    WITH ranked AS (
      SELECT sale_date,
        ROW_NUMBER() OVER (
          PARTITION BY EXTRACT(DOW FROM sale_date)
          ORDER BY sale_date DESC
        ) AS rn
      FROM (SELECT DISTINCT sale_date FROM public.sales_prod_daily_agg) t
    )
    SELECT array_agg(sale_date) INTO v_dates
    FROM ranked
    WHERE rn > 4;

    IF array_length(v_dates, 1) IS NOT NULL THEN
      DELETE FROM public.sales_prod_daily_agg WHERE sale_date = ANY(v_dates);
      DELETE FROM public.sales_daily_agg WHERE sale_date = ANY(v_dates);
      DELETE FROM public.import_log WHERE sale_date = ANY(v_dates);
    END IF;
  END IF;

  RETURN jsonb_build_object('ok', true, 'rows', v_count);
END;
$$;

-- Permissões (idênticas à definição anterior)
REVOKE EXECUTE ON FUNCTION public.finalize_import(uuid,date,integer,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finalize_import(uuid,date,integer,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_import(uuid,date,integer,uuid) TO service_role;
