
-- 1) Hierarchy table
CREATE TABLE IF NOT EXISTS public.filter_hierarchy (
  store_code text NOT NULL,
  store_name text NOT NULL,
  depto text,
  secao text,
  grupo text,
  subgrupo text
);

GRANT SELECT ON public.filter_hierarchy TO authenticated;
GRANT ALL ON public.filter_hierarchy TO service_role;

ALTER TABLE public.filter_hierarchy ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "approved users read filter hierarchy" ON public.filter_hierarchy;
CREATE POLICY "approved users read filter hierarchy"
ON public.filter_hierarchy FOR SELECT TO authenticated
USING (public.is_approved(auth.uid()));

CREATE INDEX IF NOT EXISTS filter_hierarchy_store_idx    ON public.filter_hierarchy(store_code);
CREATE INDEX IF NOT EXISTS filter_hierarchy_depto_idx    ON public.filter_hierarchy(depto);
CREATE INDEX IF NOT EXISTS filter_hierarchy_secao_idx    ON public.filter_hierarchy(secao);
CREATE INDEX IF NOT EXISTS filter_hierarchy_grupo_idx    ON public.filter_hierarchy(grupo);
CREATE INDEX IF NOT EXISTS filter_hierarchy_subgrupo_idx ON public.filter_hierarchy(subgrupo);

-- 2) Refresh function
CREATE OR REPLACE FUNCTION public.refresh_filter_hierarchy()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  TRUNCATE public.filter_hierarchy;
  INSERT INTO public.filter_hierarchy(store_code, store_name, depto, secao, grupo, subgrupo)
  SELECT store_code, min(store_name), depto, secao, grupo, subgrupo
  FROM public.sales_daily_agg
  GROUP BY store_code, depto, secao, grupo, subgrupo;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.refresh_filter_hierarchy() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.refresh_filter_hierarchy() TO service_role;

-- Initial populate
SELECT public.refresh_filter_hierarchy();

-- 3) Hook hierarchy refresh into the existing daily-agg refresh
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
  PERFORM public.refresh_filter_hierarchy();
END;
$function$;

-- 4) Fast filter_options backed by hierarchy table
CREATE OR REPLACE FUNCTION public.filter_options(
  p_date_from date, p_date_to date,
  p_stores text[] DEFAULT '{}'::text[],
  p_deptos text[] DEFAULT '{}'::text[],
  p_secoes text[] DEFAULT '{}'::text[],
  p_grupos text[] DEFAULT '{}'::text[]
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $function$
DECLARE
  v_latest date;
  v_stores jsonb; v_deptos jsonb; v_secoes jsonb; v_grupos jsonb; v_subgrupos jsonb;
  v_available jsonb;
BEGIN
  IF NOT public.is_approved(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;

  -- Available dates: directly from import log (fast)
  SELECT coalesce(jsonb_agg(sale_date ORDER BY sale_date), '[]'::jsonb)
    INTO v_available
  FROM (SELECT DISTINCT sale_date FROM public.import_log) t;

  SELECT max(sale_date) INTO v_latest FROM public.import_log;

  WITH h AS (
    SELECT * FROM public.filter_hierarchy
    WHERE (coalesce(array_length(p_stores,1),0)=0 OR store_code = ANY(p_stores))
      AND (coalesce(array_length(p_deptos,1),0)=0 OR depto      = ANY(p_deptos))
      AND (coalesce(array_length(p_secoes,1),0)=0 OR secao      = ANY(p_secoes))
      AND (coalesce(array_length(p_grupos,1),0)=0 OR grupo      = ANY(p_grupos))
  )
  SELECT
    coalesce((SELECT jsonb_agg(jsonb_build_object('store_code',store_code,'store_name',store_name) ORDER BY store_name)
              FROM (SELECT DISTINCT store_code, store_name FROM h) s),'[]'::jsonb),
    coalesce((SELECT jsonb_agg(DISTINCT depto    ORDER BY depto)    FILTER (WHERE depto    IS NOT NULL) FROM h),'[]'::jsonb),
    coalesce((SELECT jsonb_agg(DISTINCT secao    ORDER BY secao)    FILTER (WHERE secao    IS NOT NULL) FROM h),'[]'::jsonb),
    coalesce((SELECT jsonb_agg(DISTINCT grupo    ORDER BY grupo)    FILTER (WHERE grupo    IS NOT NULL) FROM h),'[]'::jsonb),
    coalesce((SELECT jsonb_agg(DISTINCT subgrupo ORDER BY subgrupo) FILTER (WHERE subgrupo IS NOT NULL) FROM h),'[]'::jsonb)
  INTO v_stores, v_deptos, v_secoes, v_grupos, v_subgrupos;

  RETURN jsonb_build_object(
    'latestDate', v_latest,
    'stores', v_stores,
    'deptos', v_deptos,
    'secoes', v_secoes,
    'grupos', v_grupos,
    'subgrupos', v_subgrupos,
    'availableDates', v_available
  );
END;
$function$;
