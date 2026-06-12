
-- 1. import_log
CREATE TABLE public.import_log (
  sale_date date PRIMARY KEY,
  row_count integer NOT NULL DEFAULT 0,
  imported_at timestamptz NOT NULL DEFAULT now(),
  imported_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.import_log TO authenticated;
GRANT ALL ON public.import_log TO service_role;
ALTER TABLE public.import_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY import_log_select_approved ON public.import_log
  FOR SELECT TO authenticated USING (public.is_approved(auth.uid()));
CREATE POLICY import_log_admin_all ON public.import_log
  FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

-- 2. Indexes for sales
CREATE INDEX IF NOT EXISTS idx_sales_sale_date ON public.sales (sale_date);
CREATE INDEX IF NOT EXISTS idx_sales_date_depto ON public.sales (sale_date, depto);
CREATE INDEX IF NOT EXISTS idx_sales_date_store ON public.sales (sale_date, store_code);
CREATE INDEX IF NOT EXISTS idx_sales_prod_date ON public.sales (prod_code, sale_date DESC);

-- 3. imported_dates RPC
CREATE OR REPLACE FUNCTION public.imported_dates()
RETURNS TABLE (sale_date date, row_count integer, imported_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT sale_date, row_count, imported_at
  FROM public.import_log
  WHERE public.is_approved(auth.uid())
  ORDER BY sale_date DESC;
$$;

-- 4. filter_options RPC — distinct hierarchies/stores in a date window
CREATE OR REPLACE FUNCTION public.filter_options(p_date_from date, p_date_to date)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_latest date;
  v_stores jsonb;
  v_deptos jsonb;
  v_secoes jsonb;
  v_grupos jsonb;
  v_subgrupos jsonb;
BEGIN
  IF NOT public.is_approved(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT max(sale_date) INTO v_latest FROM public.sales;

  WITH s AS (
    SELECT DISTINCT store_code, store_name
    FROM public.sales
    WHERE (p_date_from IS NULL OR sale_date >= p_date_from)
      AND (p_date_to   IS NULL OR sale_date <= p_date_to)
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object('store_code',store_code,'store_name',store_name) ORDER BY store_name),'[]'::jsonb)
    INTO v_stores FROM s;

  SELECT coalesce(jsonb_agg(DISTINCT depto ORDER BY depto) FILTER (WHERE depto IS NOT NULL),'[]'::jsonb) INTO v_deptos
    FROM public.sales WHERE (p_date_from IS NULL OR sale_date >= p_date_from) AND (p_date_to IS NULL OR sale_date <= p_date_to);
  SELECT coalesce(jsonb_agg(DISTINCT secao ORDER BY secao) FILTER (WHERE secao IS NOT NULL),'[]'::jsonb) INTO v_secoes
    FROM public.sales WHERE (p_date_from IS NULL OR sale_date >= p_date_from) AND (p_date_to IS NULL OR sale_date <= p_date_to);
  SELECT coalesce(jsonb_agg(DISTINCT grupo ORDER BY grupo) FILTER (WHERE grupo IS NOT NULL),'[]'::jsonb) INTO v_grupos
    FROM public.sales WHERE (p_date_from IS NULL OR sale_date >= p_date_from) AND (p_date_to IS NULL OR sale_date <= p_date_to);
  SELECT coalesce(jsonb_agg(DISTINCT subgrupo ORDER BY subgrupo) FILTER (WHERE subgrupo IS NOT NULL),'[]'::jsonb) INTO v_subgrupos
    FROM public.sales WHERE (p_date_from IS NULL OR sale_date >= p_date_from) AND (p_date_to IS NULL OR sale_date <= p_date_to);

  RETURN jsonb_build_object(
    'latestDate', v_latest,
    'stores', v_stores,
    'deptos', v_deptos,
    'secoes', v_secoes,
    'grupos', v_grupos,
    'subgrupos', v_subgrupos
  );
END;
$$;

-- 5. dashboard_metrics RPC
CREATE OR REPLACE FUNCTION public.dashboard_metrics(
  p_date_from date,
  p_date_to date,
  p_stores text[] DEFAULT '{}',
  p_deptos text[] DEFAULT '{}',
  p_secoes text[] DEFAULT '{}',
  p_grupos text[] DEFAULT '{}',
  p_subgrupos text[] DEFAULT '{}'
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_total numeric;
  v_count bigint;
  v_by_store jsonb;
  v_by_depto jsonb;
  v_by_date jsonb;
BEGIN
  IF NOT public.is_approved(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  -- Build a CTE-style temp using a single filtered set via subquery (Postgres will plan it well per agg).
  WITH f AS (
    SELECT *
    FROM public.sales
    WHERE (p_date_from IS NULL OR sale_date >= p_date_from)
      AND (p_date_to   IS NULL OR sale_date <= p_date_to)
      AND (coalesce(array_length(p_stores,1),0)=0    OR store_code = ANY(p_stores))
      AND (coalesce(array_length(p_deptos,1),0)=0    OR depto      = ANY(p_deptos))
      AND (coalesce(array_length(p_secoes,1),0)=0    OR secao      = ANY(p_secoes))
      AND (coalesce(array_length(p_grupos,1),0)=0    OR grupo      = ANY(p_grupos))
      AND (coalesce(array_length(p_subgrupos,1),0)=0 OR subgrupo   = ANY(p_subgrupos))
  )
  SELECT
    coalesce(sum(val_vda),0),
    count(*)::bigint
  INTO v_total, v_count
  FROM f;

  SELECT coalesce(jsonb_agg(x ORDER BY (x->>'val')::numeric DESC),'[]'::jsonb) INTO v_by_store FROM (
    SELECT jsonb_build_object('code',store_code,'name',min(store_name),'val',sum(val_vda)) AS x
    FROM public.sales
    WHERE (p_date_from IS NULL OR sale_date >= p_date_from)
      AND (p_date_to   IS NULL OR sale_date <= p_date_to)
      AND (coalesce(array_length(p_stores,1),0)=0    OR store_code = ANY(p_stores))
      AND (coalesce(array_length(p_deptos,1),0)=0    OR depto      = ANY(p_deptos))
      AND (coalesce(array_length(p_secoes,1),0)=0    OR secao      = ANY(p_secoes))
      AND (coalesce(array_length(p_grupos,1),0)=0    OR grupo      = ANY(p_grupos))
      AND (coalesce(array_length(p_subgrupos,1),0)=0 OR subgrupo   = ANY(p_subgrupos))
    GROUP BY store_code
  ) t;

  SELECT coalesce(jsonb_agg(x ORDER BY (x->>'val')::numeric DESC),'[]'::jsonb) INTO v_by_depto FROM (
    SELECT jsonb_build_object('name',coalesce(depto,'(sem departamento)'),'val',sum(val_vda)) AS x
    FROM public.sales
    WHERE (p_date_from IS NULL OR sale_date >= p_date_from)
      AND (p_date_to   IS NULL OR sale_date <= p_date_to)
      AND (coalesce(array_length(p_stores,1),0)=0    OR store_code = ANY(p_stores))
      AND (coalesce(array_length(p_deptos,1),0)=0    OR depto      = ANY(p_deptos))
      AND (coalesce(array_length(p_secoes,1),0)=0    OR secao      = ANY(p_secoes))
      AND (coalesce(array_length(p_grupos,1),0)=0    OR grupo      = ANY(p_grupos))
      AND (coalesce(array_length(p_subgrupos,1),0)=0 OR subgrupo   = ANY(p_subgrupos))
    GROUP BY depto
  ) t;

  SELECT coalesce(jsonb_agg(x ORDER BY x->>'date'),'[]'::jsonb) INTO v_by_date FROM (
    SELECT jsonb_build_object('date',sale_date,'val',sum(val_vda)) AS x
    FROM public.sales
    WHERE (p_date_from IS NULL OR sale_date >= p_date_from)
      AND (p_date_to   IS NULL OR sale_date <= p_date_to)
      AND (coalesce(array_length(p_stores,1),0)=0    OR store_code = ANY(p_stores))
      AND (coalesce(array_length(p_deptos,1),0)=0    OR depto      = ANY(p_deptos))
      AND (coalesce(array_length(p_secoes,1),0)=0    OR secao      = ANY(p_secoes))
      AND (coalesce(array_length(p_grupos,1),0)=0    OR grupo      = ANY(p_grupos))
      AND (coalesce(array_length(p_subgrupos,1),0)=0 OR subgrupo   = ANY(p_subgrupos))
    GROUP BY sale_date
  ) t;

  RETURN jsonb_build_object(
    'total', v_total,
    'count', v_count,
    'byStore', v_by_store,
    'byDepto', v_by_depto,
    'byDate', v_by_date
  );
END;
$$;

-- 6. product_search
CREATE OR REPLACE FUNCTION public.product_search(p_q text)
RETURNS TABLE (prod_code text, prod_name text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT prod_code, prod_name FROM public.products
  WHERE public.is_approved(auth.uid())
    AND (prod_name ILIKE '%'||p_q||'%' OR prod_code ILIKE '%'||p_q||'%')
  ORDER BY prod_name LIMIT 20;
$$;

-- 7. product_analysis with optional store filter
CREATE OR REPLACE FUNCTION public.product_analysis(
  p_prod_code text,
  p_store_code text DEFAULT NULL,
  p_ref_date date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
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
  IF NOT public.is_approved(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

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
    INTO v_evolution FROM (SELECT * FROM agg ORDER BY sale_date DESC LIMIT 60) x;

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
$$;
