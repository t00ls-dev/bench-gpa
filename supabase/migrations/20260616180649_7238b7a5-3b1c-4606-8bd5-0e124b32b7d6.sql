
CREATE OR REPLACE FUNCTION public.filter_options(p_date_from date, p_date_to date, p_stores text[] DEFAULT '{}'::text[], p_deptos text[] DEFAULT '{}'::text[], p_secoes text[] DEFAULT '{}'::text[], p_grupos text[] DEFAULT '{}'::text[])
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_latest date;
  v_stores jsonb; v_deptos jsonb; v_secoes jsonb; v_grupos jsonb; v_subgrupos jsonb;
  v_available jsonb;
BEGIN
  IF NOT public.is_approved(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;

  -- All available dates respecting non-date filters (ignores p_date_from/p_date_to)
  SELECT coalesce(jsonb_agg(DISTINCT sale_date ORDER BY sale_date), '[]'::jsonb)
    INTO v_available
  FROM public.sales_daily_agg
  WHERE (coalesce(array_length(p_stores,1),0)=0 OR store_code=ANY(p_stores))
    AND (coalesce(array_length(p_deptos,1),0)=0 OR depto=ANY(p_deptos))
    AND (coalesce(array_length(p_secoes,1),0)=0 OR secao=ANY(p_secoes))
    AND (coalesce(array_length(p_grupos,1),0)=0 OR grupo=ANY(p_grupos));

  -- Latest available within the current filter context (most recent date with data)
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
