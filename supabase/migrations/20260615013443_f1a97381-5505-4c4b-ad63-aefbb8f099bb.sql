
DROP POLICY IF EXISTS sda_select_approved ON public.sales_daily_agg;
DROP POLICY IF EXISTS sda_admin_all       ON public.sales_daily_agg;
CREATE POLICY sda_select_approved ON public.sales_daily_agg
  FOR SELECT TO authenticated USING (public.is_approved(auth.uid()));
CREATE POLICY sda_admin_all ON public.sales_daily_agg
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE OR REPLACE FUNCTION public.refresh_sales_daily_agg(p_date date)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  DELETE FROM public.sales_daily_agg WHERE sale_date = p_date;
  INSERT INTO public.sales_daily_agg
    (sale_date, store_code, store_name, depto, secao, grupo, subgrupo, val_vda, item_count)
  SELECT sale_date, store_code, min(store_name),
         depto, secao, grupo, subgrupo, sum(val_vda), count(*)
  FROM public.sales WHERE sale_date = p_date
  GROUP BY sale_date, store_code, depto, secao, grupo, subgrupo;
END;
$$;

CREATE OR REPLACE FUNCTION public.dashboard_metrics(
  p_date_from date, p_date_to date,
  p_stores text[] DEFAULT '{}'::text[], p_deptos text[] DEFAULT '{}'::text[],
  p_secoes text[] DEFAULT '{}'::text[], p_grupos text[] DEFAULT '{}'::text[],
  p_subgrupos text[] DEFAULT '{}'::text[]
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_total numeric; v_count bigint;
  v_by_store jsonb; v_by_depto jsonb; v_by_date jsonb;
BEGIN
  IF NOT public.is_approved(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
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
$$;

DROP FUNCTION IF EXISTS public.filter_options(date, date);
CREATE OR REPLACE FUNCTION public.filter_options(
  p_date_from date, p_date_to date,
  p_stores text[] DEFAULT '{}'::text[], p_deptos text[] DEFAULT '{}'::text[],
  p_secoes text[] DEFAULT '{}'::text[], p_grupos text[] DEFAULT '{}'::text[]
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_latest date;
  v_stores jsonb; v_deptos jsonb; v_secoes jsonb; v_grupos jsonb; v_subgrupos jsonb;
BEGIN
  IF NOT public.is_approved(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT max(sale_date) INTO v_latest FROM public.sales_daily_agg;

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
    'secoes',v_secoes,'grupos',v_grupos,'subgrupos',v_subgrupos);
END;
$$;
