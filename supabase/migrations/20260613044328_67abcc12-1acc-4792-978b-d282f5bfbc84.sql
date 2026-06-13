
-- Tabela de estoque (Pique)
CREATE TABLE public.stock (
  stock_date date NOT NULL,
  store_code text NOT NULL,
  prod_code text NOT NULL,
  qtd_estoque numeric NOT NULL DEFAULT 0,
  valor_estoq numeric NOT NULL DEFAULT 0,
  PRIMARY KEY (stock_date, store_code, prod_code)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.stock TO authenticated;
GRANT ALL ON public.stock TO service_role;

ALTER TABLE public.stock ENABLE ROW LEVEL SECURITY;

CREATE POLICY stock_select_approved ON public.stock
  FOR SELECT TO authenticated
  USING (public.is_approved(auth.uid()));

CREATE POLICY stock_admin_all ON public.stock
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE INDEX idx_stock_prod_date ON public.stock (prod_code, stock_date DESC);
CREATE INDEX idx_stock_store_date ON public.stock (store_code, stock_date DESC);
CREATE INDEX idx_stock_date ON public.stock (stock_date);

-- Log de importações de estoque
CREATE TABLE public.stock_import_log (
  stock_date date PRIMARY KEY,
  row_count integer NOT NULL DEFAULT 0,
  imported_at timestamptz NOT NULL DEFAULT now(),
  imported_by uuid
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.stock_import_log TO authenticated;
GRANT ALL ON public.stock_import_log TO service_role;

ALTER TABLE public.stock_import_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY stock_import_log_select_approved ON public.stock_import_log
  FOR SELECT TO authenticated
  USING (public.is_approved(auth.uid()));

CREATE POLICY stock_import_log_admin_all ON public.stock_import_log
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

-- Datas importadas de estoque
CREATE OR REPLACE FUNCTION public.imported_stock_dates()
RETURNS TABLE(stock_date date, row_count integer, imported_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT stock_date, row_count, imported_at
  FROM public.stock_import_log
  WHERE public.is_approved(auth.uid())
  ORDER BY stock_date DESC;
$$;

-- Estoque "as of" (mais recente até a data)
CREATE OR REPLACE FUNCTION public.stock_at(p_date date, p_store text, p_prod text)
RETURNS TABLE(stock_date date, qtd_estoque numeric, valor_estoq numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT stock_date, qtd_estoque, valor_estoq
  FROM public.stock
  WHERE prod_code = p_prod
    AND store_code = p_store
    AND stock_date <= p_date
  ORDER BY stock_date DESC
  LIMIT 1;
$$;

-- Histórico de estoque de um produto (opcionalmente por loja)
CREATE OR REPLACE FUNCTION public.product_stock_history(p_prod_code text, p_store_code text DEFAULT NULL)
RETURNS TABLE(stock_date date, qtd_estoque numeric, valor_estoq numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT stock_date,
         CASE WHEN p_store_code IS NULL THEN sum(qtd_estoque) ELSE max(qtd_estoque) END,
         CASE WHEN p_store_code IS NULL THEN sum(valor_estoq) ELSE max(valor_estoq) END
  FROM public.stock
  WHERE prod_code = p_prod_code
    AND (p_store_code IS NULL OR store_code = p_store_code)
    AND public.is_approved(auth.uid())
  GROUP BY stock_date
  ORDER BY stock_date DESC;
$$;

-- Produtos em queda
CREATE OR REPLACE FUNCTION public.products_in_decline(
  p_date_from date,
  p_date_to date,
  p_stores text[] DEFAULT '{}',
  p_deptos text[] DEFAULT '{}',
  p_secoes text[] DEFAULT '{}',
  p_prod_codes text[] DEFAULT '{}'
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_result jsonb;
  v_hist_from date;
BEGIN
  IF NOT public.is_approved(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  v_hist_from := p_date_to - INTERVAL '30 days';

  WITH recent AS (
    SELECT store_code, min(store_name) store_name, prod_code, min(prod_name) prod_name,
           min(depto) depto, min(secao) secao,
           sum(val_vda) sum_recent,
           count(DISTINCT sale_date) FILTER (WHERE val_vda > 0) days_with_sale_recent,
           max(sale_date) FILTER (WHERE val_vda > 0) last_sale_date
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
           max(sale_date) FILTER (WHERE val_vda > 0) last_sale_overall
    FROM public.sales
    WHERE sale_date BETWEEN v_hist_from AND p_date_to
    GROUP BY store_code, prod_code
  ),
  base AS (
    SELECT r.*, h.sum_hist, h.days_with_sale_hist,
           greatest(coalesce(h.last_sale_overall, r.last_sale_date), r.last_sale_date) AS last_sale,
           (p_date_to - p_date_from + 1) AS days_recent_window,
           (p_date_to - v_hist_from + 1) AS days_hist_window
    FROM recent r
    LEFT JOIN hist h USING (store_code, prod_code)
    WHERE coalesce(h.days_with_sale_hist,0) >= 5  -- histórico consistente
  ),
  enriched AS (
    SELECT b.*,
           (b.sum_hist / NULLIF(b.days_hist_window,0)) AS avg_daily_hist,
           (b.sum_recent / NULLIF(b.days_recent_window,0)) AS avg_daily_recent,
           (p_date_to - b.last_sale) AS days_without_sale,
           (SELECT qtd_estoque FROM public.stock s
             WHERE s.prod_code = b.prod_code AND s.store_code = b.store_code
               AND s.stock_date <= p_date_to
             ORDER BY s.stock_date DESC LIMIT 1) AS current_stock,
           (SELECT stock_date FROM public.stock s
             WHERE s.prod_code = b.prod_code AND s.store_code = b.store_code
               AND s.stock_date <= p_date_to
             ORDER BY s.stock_date DESC LIMIT 1) AS stock_ref_date
    FROM base b
  ),
  classified AS (
    SELECT e.*,
           CASE
             WHEN avg_daily_hist IS NULL OR avg_daily_hist = 0 THEN 0
             ELSE ((avg_daily_recent - avg_daily_hist) / avg_daily_hist)
           END AS variation
    FROM enriched e
  ),
  final AS (
    SELECT c.*,
      CASE
        WHEN coalesce(current_stock,0) <= 0 THEN 'sem_estoque'
        WHEN sum_recent = 0 AND days_with_sale_hist >= 5 THEN 'critico'
        WHEN variation <= -0.7 THEN 'alerta'
        WHEN variation <= -0.4 THEN 'atencao'
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
    'current_stock', current_stock,
    'stock_ref_date', stock_ref_date,
    'status', status
  ) ORDER BY
    CASE status WHEN 'critico' THEN 0 WHEN 'alerta' THEN 1 WHEN 'atencao' THEN 2 WHEN 'sem_estoque' THEN 3 ELSE 4 END,
    variation NULLS LAST
  ), '[]'::jsonb) INTO v_result
  FROM final
  WHERE status IN ('critico','alerta','atencao','sem_estoque');

  RETURN v_result;
END;
$$;
