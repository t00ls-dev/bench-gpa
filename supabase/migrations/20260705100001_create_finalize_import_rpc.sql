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
  -- Valida que o número de linhas na staging corresponde ao esperado
  SELECT COUNT(*) INTO v_count
  FROM public.staging_sales WHERE batch_id = p_batch_id;

  IF v_count != p_row_count THEN
    RAISE EXCEPTION 'staging count mismatch: expected %, got %', p_row_count, v_count;
  END IF;

  -- Swap atômico: deleta dados antigos e insere os novos da staging
  DELETE FROM public.sales WHERE sale_date = p_sale_date;

  INSERT INTO public.sales
    (sale_date, store_code, store_name, depto, secao,
     grupo, subgrupo, prod_code, prod_name, val_vda)
  SELECT sale_date, store_code, store_name, depto, secao,
         grupo, subgrupo, prod_code, prod_name, val_vda
  FROM public.staging_sales
  WHERE batch_id = p_batch_id;

  -- Limpa staging (batch atual + possíveis órfãos da mesma data)
  DELETE FROM public.staging_sales WHERE batch_id = p_batch_id
     OR sale_date = p_sale_date;

  -- Registra no log de importação
  INSERT INTO public.import_log (sale_date, row_count, imported_at, imported_by)
  VALUES (p_sale_date, p_row_count, now(), p_imported_by)
  ON CONFLICT (sale_date) DO UPDATE SET
    row_count = EXCLUDED.row_count,
    imported_at = EXCLUDED.imported_at,
    imported_by = EXCLUDED.imported_by;

  RETURN jsonb_build_object('ok', true, 'rows', v_count);
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_import(UUID, DATE, INTEGER, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finalize_import(UUID, DATE, INTEGER, UUID) TO service_role;
