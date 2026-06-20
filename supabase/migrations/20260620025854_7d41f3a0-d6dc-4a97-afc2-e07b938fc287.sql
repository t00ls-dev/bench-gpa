
-- ========= Custom Analyses (user-owned product lists) =========
CREATE TABLE public.custom_analyses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.custom_analyses TO authenticated;
GRANT ALL ON public.custom_analyses TO service_role;
ALTER TABLE public.custom_analyses ENABLE ROW LEVEL SECURITY;

CREATE POLICY ca_select_own ON public.custom_analyses FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY ca_insert_own ON public.custom_analyses FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY ca_update_own ON public.custom_analyses FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY ca_delete_own ON public.custom_analyses FOR DELETE TO authenticated
  USING (user_id = auth.uid());

CREATE INDEX idx_custom_analyses_user ON public.custom_analyses(user_id, updated_at DESC);

CREATE TABLE public.custom_analysis_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_id uuid NOT NULL REFERENCES public.custom_analyses(id) ON DELETE CASCADE,
  prod_code text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (analysis_id, prod_code)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.custom_analysis_items TO authenticated;
GRANT ALL ON public.custom_analysis_items TO service_role;
ALTER TABLE public.custom_analysis_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY cai_select_own ON public.custom_analysis_items FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.custom_analyses a WHERE a.id = analysis_id AND a.user_id = auth.uid()));
CREATE POLICY cai_insert_own ON public.custom_analysis_items FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.custom_analyses a WHERE a.id = analysis_id AND a.user_id = auth.uid()));
CREATE POLICY cai_delete_own ON public.custom_analysis_items FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.custom_analyses a WHERE a.id = analysis_id AND a.user_id = auth.uid()));

CREATE INDEX idx_cai_analysis ON public.custom_analysis_items(analysis_id);

-- Trigger to keep updated_at fresh
CREATE OR REPLACE FUNCTION public.touch_custom_analyses_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

CREATE TRIGGER trg_custom_analyses_updated_at
  BEFORE UPDATE ON public.custom_analyses
  FOR EACH ROW EXECUTE FUNCTION public.touch_custom_analyses_updated_at();

-- Bump parent updated_at when items change
CREATE OR REPLACE FUNCTION public.bump_custom_analysis_parent()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  v_id := COALESCE(NEW.analysis_id, OLD.analysis_id);
  UPDATE public.custom_analyses SET updated_at = now() WHERE id = v_id;
  RETURN COALESCE(NEW, OLD);
END $$;

CREATE TRIGGER trg_cai_bump_parent
  AFTER INSERT OR DELETE ON public.custom_analysis_items
  FOR EACH ROW EXECUTE FUNCTION public.bump_custom_analysis_parent();

-- ========= Extended dashboard rankings RPC =========
CREATE OR REPLACE FUNCTION public.dashboard_rankings(
  p_date_from date, p_date_to date,
  p_stores text[] DEFAULT '{}', p_deptos text[] DEFAULT '{}',
  p_secoes text[] DEFAULT '{}', p_grupos text[] DEFAULT '{}',
  p_subgrupos text[] DEFAULT '{}', p_limit int DEFAULT 10
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_depto jsonb; v_secao jsonb; v_grupo jsonb; v_subgrupo jsonb; v_produto jsonb;
BEGIN
  IF NOT public.is_approved(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;

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

  -- top produtos: precisa de granularidade do sales (sales_daily_agg não tem prod_code)
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
END $$;

-- ========= Custom analysis results (sales rollup for a given user-owned analysis) =========
CREATE OR REPLACE FUNCTION public.custom_analysis_results(
  p_analysis_id uuid,
  p_date_from date, p_date_to date,
  p_stores text[] DEFAULT '{}', p_deptos text[] DEFAULT '{}',
  p_secoes text[] DEFAULT '{}', p_grupos text[] DEFAULT '{}', p_subgrupos text[] DEFAULT '{}'
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_owner uuid;
  v_total numeric;
  v_products jsonb;
  v_plus_total bigint;
  v_plus_with_sale bigint;
BEGIN
  IF NOT public.is_approved(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT user_id INTO v_owner FROM public.custom_analyses WHERE id = p_analysis_id;
  IF v_owner IS NULL OR v_owner <> auth.uid() THEN RAISE EXCEPTION 'forbidden'; END IF;

  WITH items AS (
    SELECT prod_code FROM public.custom_analysis_items WHERE analysis_id = p_analysis_id
  ),
  -- universe: items joined with latest known hierarchy from sales (fallback to products)
  universe AS (
    SELECT i.prod_code,
           COALESCE((SELECT prod_name FROM public.products p WHERE p.prod_code = i.prod_code), i.prod_code) AS prod_name,
           h.depto, h.secao, h.grupo, h.subgrupo,
           EXISTS (SELECT 1 FROM public.products p WHERE p.prod_code = i.prod_code) AS exists_in_base
    FROM items i
    LEFT JOIN LATERAL (
      SELECT depto, secao, grupo, subgrupo
      FROM public.sales s
      WHERE s.prod_code = i.prod_code
      ORDER BY sale_date DESC LIMIT 1
    ) h ON true
  ),
  cur AS (
    SELECT s.* FROM public.sales s
    JOIN items i USING (prod_code)
    WHERE s.sale_date BETWEEN p_date_from AND p_date_to
      AND (coalesce(array_length(p_stores,1),0)=0    OR s.store_code = ANY(p_stores))
      AND (coalesce(array_length(p_deptos,1),0)=0    OR s.depto      = ANY(p_deptos))
      AND (coalesce(array_length(p_secoes,1),0)=0    OR s.secao      = ANY(p_secoes))
      AND (coalesce(array_length(p_grupos,1),0)=0    OR s.grupo      = ANY(p_grupos))
      AND (coalesce(array_length(p_subgrupos,1),0)=0 OR s.subgrupo   = ANY(p_subgrupos))
  ),
  cur_agg AS (
    SELECT prod_code, sum(val_vda) val, count(*)::bigint qty FROM cur GROUP BY prod_code
  ),
  joined AS (
    SELECT u.prod_code, u.prod_name, u.depto, u.secao, u.grupo, u.subgrupo,
           u.exists_in_base,
           COALESCE(c.val, 0) val, COALESCE(c.qty, 0) qty
    FROM universe u LEFT JOIN cur_agg c ON c.prod_code = u.prod_code
  )
  SELECT
    COALESCE((SELECT sum(val_vda) FROM cur), 0),
    COALESCE((SELECT count(*) FROM universe), 0)::bigint,
    COALESCE((SELECT count(*) FROM cur_agg WHERE val > 0), 0)::bigint,
    COALESCE(jsonb_agg(jsonb_build_object(
      'prod_code', prod_code, 'prod_name', prod_name,
      'depto', depto, 'secao', secao, 'grupo', grupo, 'subgrupo', subgrupo,
      'val', val, 'qty', qty, 'exists_in_base', exists_in_base
    ) ORDER BY val DESC NULLS LAST, prod_code), '[]'::jsonb)
  INTO v_total, v_plus_total, v_plus_with_sale, v_products
  FROM joined;

  RETURN jsonb_build_object(
    'total', v_total,
    'plusTotal', v_plus_total,
    'plusWithSale', v_plus_with_sale,
    'plusWithoutSale', GREATEST(v_plus_total - v_plus_with_sale, 0),
    'avgPerPlu', CASE WHEN v_plus_with_sale > 0 THEN v_total / v_plus_with_sale ELSE 0 END,
    'products', v_products
  );
END $$;
