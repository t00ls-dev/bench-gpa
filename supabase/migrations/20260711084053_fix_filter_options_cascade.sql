
CREATE OR REPLACE FUNCTION public.filter_options(p_date_from date, p_date_to date, p_stores text[] DEFAULT '{}'::text[], p_deptos text[] DEFAULT '{}'::text[], p_secoes text[] DEFAULT '{}'::text[], p_grupos text[] DEFAULT '{}'::text[])
 RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path TO 'public'
AS $$
DECLARE
  v_latest date;
  v_stores jsonb; v_deptos jsonb; v_secoes jsonb; v_grupos jsonb; v_subgrupos jsonb;
  v_available jsonb;
BEGIN
  IF NOT public.is_active_user(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;

  SELECT coalesce(jsonb_agg(sale_date ORDER BY sale_date), '[]'::jsonb)
    INTO v_available
  FROM (SELECT DISTINCT sale_date FROM public.import_log) t;

  SELECT max(sale_date) INTO v_latest FROM public.import_log;

  WITH
  h_deptos AS (
    SELECT * FROM public.filter_hierarchy
    WHERE (coalesce(array_length(p_stores,1),0)=0 OR store_code = ANY(p_stores))
  ),
  h_secoes AS (
    SELECT * FROM h_deptos
    WHERE (coalesce(array_length(p_deptos,1),0)=0 OR depto = ANY(p_deptos))
  ),
  h_grupos AS (
    SELECT * FROM h_secoes
    WHERE (coalesce(array_length(p_secoes,1),0)=0 OR secao = ANY(p_secoes))
  ),
  h_subgrupos AS (
    SELECT * FROM h_grupos
    WHERE (coalesce(array_length(p_grupos,1),0)=0 OR grupo = ANY(p_grupos))
  )
  SELECT
    coalesce((SELECT jsonb_agg(jsonb_build_object('store_code',store_code,'store_name',store_name) ORDER BY store_name)
              FROM (SELECT DISTINCT store_code, store_name FROM public.filter_hierarchy) s),'[]'::jsonb),
    coalesce((SELECT jsonb_agg(DISTINCT depto    ORDER BY depto)    FILTER (WHERE depto    IS NOT NULL) FROM h_deptos),'[]'::jsonb),
    coalesce((SELECT jsonb_agg(DISTINCT secao    ORDER BY secao)    FILTER (WHERE secao    IS NOT NULL) FROM h_secoes),'[]'::jsonb),
    coalesce((SELECT jsonb_agg(DISTINCT grupo    ORDER BY grupo)    FILTER (WHERE grupo    IS NOT NULL) FROM h_grupos),'[]'::jsonb),
    coalesce((SELECT jsonb_agg(DISTINCT subgrupo ORDER BY subgrupo) FILTER (WHERE subgrupo IS NOT NULL) FROM h_subgrupos),'[]'::jsonb)
  INTO v_stores, v_deptos, v_secoes, v_grupos, v_subgrupos;

  RETURN jsonb_build_object(
    'latestDate', v_latest,
    'stores', v_stores, 'deptos', v_deptos, 'secoes', v_secoes,
    'grupos', v_grupos, 'subgrupos', v_subgrupos,
    'availableDates', v_available
  );
END;
$$;
