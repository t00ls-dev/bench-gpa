
-- =====================================================================
-- Refatoração de autenticação: tabela única users, login e-mail+senha,
-- remoção da infraestrutura de e-mail. Todos os usuários existentes são
-- apagados; admin inicial admin@gpabr.com criado com senha bcrypt.
-- =====================================================================

-- Habilita pgcrypto para bcrypt
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;

-- ---------------------------------------------------------------------
-- 1. Apagar todos os usuários atuais (limpeza pontual da migração)
-- ---------------------------------------------------------------------
DELETE FROM auth.users;

-- ---------------------------------------------------------------------
-- 2. Remover trigger e função de autocadastro antigos
-- ---------------------------------------------------------------------
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;

-- ---------------------------------------------------------------------
-- 3. Remover infra de e-mail (funções, tabelas, cron)
-- ---------------------------------------------------------------------
DO $$ BEGIN
  PERFORM cron.unschedule('process-email-queue');
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DROP FUNCTION IF EXISTS public.enqueue_email(text, jsonb) CASCADE;
DROP FUNCTION IF EXISTS public.email_queue_dispatch() CASCADE;
DROP FUNCTION IF EXISTS public.email_queue_wake() CASCADE;
DROP FUNCTION IF EXISTS public.read_email_batch(text, integer, integer) CASCADE;
DROP FUNCTION IF EXISTS public.move_to_dlq(text, text, bigint, jsonb) CASCADE;
DROP FUNCTION IF EXISTS public.delete_email(text, bigint) CASCADE;

DROP TABLE IF EXISTS public.email_send_log CASCADE;
DROP TABLE IF EXISTS public.email_send_state CASCADE;
DROP TABLE IF EXISTS public.suppressed_emails CASCADE;
DROP TABLE IF EXISTS public.email_unsubscribe_tokens CASCADE;

-- ---------------------------------------------------------------------
-- 4. Criar public.users (unifica profiles + user_roles)
-- ---------------------------------------------------------------------
CREATE TABLE public.users (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL UNIQUE CHECK (email ~ '@gpabr\.com$'),
  name text NOT NULL,
  role public.app_role NOT NULL DEFAULT 'user',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.users TO authenticated;
GRANT ALL ON public.users TO service_role;

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------
-- 5. Recriar has_role / renomear is_approved -> is_active_user
--    (drop antes das policies que dependem, recriar depois)
-- ---------------------------------------------------------------------

-- Remove policies antigas que dependem das funções
DROP POLICY IF EXISTS "profiles_select" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_admin" ON public.profiles;
DROP POLICY IF EXISTS "user_roles_select" ON public.user_roles;
DROP POLICY IF EXISTS "sales_admin_all" ON public.sales;
DROP POLICY IF EXISTS "sales_select_approved" ON public.sales;
DROP POLICY IF EXISTS "sda_admin_all" ON public.sales_daily_agg;
DROP POLICY IF EXISTS "sda_select_approved" ON public.sales_daily_agg;
DROP POLICY IF EXISTS "products_select_approved" ON public.products;
DROP POLICY IF EXISTS "stores_select_approved" ON public.stores;
DROP POLICY IF EXISTS "import_log_admin_all" ON public.import_log;
DROP POLICY IF EXISTS "import_log_select_approved" ON public.import_log;
DROP POLICY IF EXISTS "approved users read filter hierarchy" ON public.filter_hierarchy;

-- Recria has_role apontando para public.users, exigindo is_active
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = _user_id AND role = _role AND is_active = true
  )
$$;

-- Substitui is_approved por is_active_user (nome não colide com coluna is_active)
DROP FUNCTION IF EXISTS public.is_approved(uuid);
CREATE OR REPLACE FUNCTION public.is_active_user(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.users WHERE id = _user_id AND is_active = true)
$$;

REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_active_user(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_active_user(uuid) TO authenticated;

-- ---------------------------------------------------------------------
-- 6. Policies da própria tabela users
-- ---------------------------------------------------------------------
CREATE POLICY "users_self_select" ON public.users
  FOR SELECT TO authenticated
  USING (id = auth.uid());

CREATE POLICY "users_admin_select" ON public.users
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Escritas apenas via service_role (server functions do admin)

-- ---------------------------------------------------------------------
-- 7. Dropar tabelas antigas
-- ---------------------------------------------------------------------
DROP TABLE IF EXISTS public.user_roles CASCADE;
DROP TABLE IF EXISTS public.profiles CASCADE;
DROP TYPE  IF EXISTS public.user_status;

-- ---------------------------------------------------------------------
-- 8. Recriar policies das tabelas de dados usando is_active_user / has_role
-- ---------------------------------------------------------------------
CREATE POLICY "sales_select_active" ON public.sales
  FOR SELECT TO authenticated USING (public.is_active_user(auth.uid()));
CREATE POLICY "sales_admin_all" ON public.sales
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "sda_select_active" ON public.sales_daily_agg
  FOR SELECT TO authenticated USING (public.is_active_user(auth.uid()));
CREATE POLICY "sda_admin_all" ON public.sales_daily_agg
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "products_select_active" ON public.products
  FOR SELECT TO authenticated USING (public.is_active_user(auth.uid()));

CREATE POLICY "stores_select_active" ON public.stores
  FOR SELECT TO authenticated USING (public.is_active_user(auth.uid()));

CREATE POLICY "import_log_select_active" ON public.import_log
  FOR SELECT TO authenticated USING (public.is_active_user(auth.uid()));
CREATE POLICY "import_log_admin_all" ON public.import_log
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "filter_hierarchy_select_active" ON public.filter_hierarchy
  FOR SELECT TO authenticated USING (public.is_active_user(auth.uid()));

-- ---------------------------------------------------------------------
-- 9. Atualizar RPCs analíticas: is_approved -> is_active_user
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.imported_dates()
 RETURNS TABLE(sale_date date, row_count integer, imported_at timestamp with time zone)
 LANGUAGE sql STABLE SET search_path TO 'public'
AS $$
  SELECT sale_date, row_count, imported_at
  FROM public.import_log
  WHERE public.is_active_user(auth.uid())
  ORDER BY sale_date DESC;
$$;

CREATE OR REPLACE FUNCTION public.product_search(p_q text)
 RETURNS TABLE(prod_code text, prod_name text)
 LANGUAGE sql STABLE SET search_path TO 'public'
AS $$
  SELECT prod_code, prod_name FROM public.products
  WHERE public.is_active_user(auth.uid())
    AND (prod_name ILIKE '%'||p_q||'%' OR prod_code ILIKE '%'||p_q||'%')
  ORDER BY prod_name LIMIT 20;
$$;

-- Para dashboard_metrics, dashboard_rankings, filter_options, area_analysis,
-- product_analysis, products_in_decline: apenas trocar a verificação inicial.
-- Reescrevemos preservando o corpo original.

CREATE OR REPLACE FUNCTION public.dashboard_metrics(p_date_from date, p_date_to date, p_stores text[] DEFAULT '{}'::text[], p_deptos text[] DEFAULT '{}'::text[], p_secoes text[] DEFAULT '{}'::text[], p_grupos text[] DEFAULT '{}'::text[], p_subgrupos text[] DEFAULT '{}'::text[])
 RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path TO 'public'
AS $$
DECLARE
  v_total numeric; v_count bigint;
  v_by_store jsonb; v_by_depto jsonb; v_by_date jsonb;
BEGIN
  IF NOT public.is_active_user(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
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

CREATE OR REPLACE FUNCTION public.dashboard_rankings(p_date_from date, p_date_to date, p_stores text[] DEFAULT '{}'::text[], p_deptos text[] DEFAULT '{}'::text[], p_secoes text[] DEFAULT '{}'::text[], p_grupos text[] DEFAULT '{}'::text[], p_subgrupos text[] DEFAULT '{}'::text[], p_limit integer DEFAULT 10)
 RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path TO 'public'
AS $$
DECLARE
  v_depto jsonb; v_secao jsonb; v_grupo jsonb; v_subgrupo jsonb; v_produto jsonb;
BEGIN
  IF NOT public.is_active_user(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
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
    'stores', v_stores, 'deptos', v_deptos, 'secoes', v_secoes,
    'grupos', v_grupos, 'subgrupos', v_subgrupos,
    'availableDates', v_available
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.product_analysis(p_prod_code text, p_store_code text DEFAULT NULL::text, p_ref_date date DEFAULT NULL::date)
 RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path TO 'public'
AS $$
DECLARE
  v_ref date; v_ref_val numeric;
  v_prod jsonb; v_by_store jsonb; v_evolution jsonb;
  v_same_wd jsonb; v_all_last jsonb; v_ref_dow int;
BEGIN
  IF NOT public.is_active_user(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;

  IF p_ref_date IS NULL THEN
    SELECT max(sale_date) INTO v_ref FROM public.sales
     WHERE prod_code = p_prod_code
       AND (p_store_code IS NULL OR store_code = p_store_code);
  ELSE
    v_ref := p_ref_date;
  END IF;

  SELECT jsonb_build_object(
      'prod_code', p.prod_code, 'prod_name', p.prod_name,
      'depto', h.depto, 'secao', h.secao, 'grupo', h.grupo, 'subgrupo', h.subgrupo
    ) INTO v_prod
    FROM public.products p
    LEFT JOIN LATERAL (
      SELECT s.depto, s.secao, s.grupo, s.subgrupo FROM public.sales s
      WHERE s.prod_code = p.prod_code ORDER BY s.sale_date DESC LIMIT 1
    ) h ON true
    WHERE p.prod_code = p_prod_code;

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
    SELECT sale_date, sum(val_vda) AS val FROM public.sales
    WHERE prod_code = p_prod_code AND (p_store_code IS NULL OR store_code = p_store_code)
    GROUP BY sale_date
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object('date',sale_date,'val',val) ORDER BY sale_date),'[]'::jsonb)
    INTO v_evolution FROM agg;

  WITH agg AS (
    SELECT sale_date, sum(val_vda) AS val FROM public.sales
    WHERE prod_code = p_prod_code AND (p_store_code IS NULL OR store_code = p_store_code)
      AND sale_date < v_ref GROUP BY sale_date
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object('date',sale_date,'val',val) ORDER BY sale_date),'[]'::jsonb)
    INTO v_same_wd FROM (
      SELECT * FROM agg WHERE EXTRACT(DOW FROM sale_date)::int = v_ref_dow
      ORDER BY sale_date DESC LIMIT 4
    ) x;

  WITH agg AS (
    SELECT sale_date, sum(val_vda) AS val FROM public.sales
    WHERE prod_code = p_prod_code AND (p_store_code IS NULL OR store_code = p_store_code)
      AND sale_date < v_ref GROUP BY sale_date
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object('date',sale_date,'val',val) ORDER BY sale_date),'[]'::jsonb)
    INTO v_all_last FROM (SELECT * FROM agg ORDER BY sale_date DESC LIMIT 4) x;

  RETURN jsonb_build_object(
    'product', v_prod, 'refDate', v_ref, 'refValue', v_ref_val,
    'byStore', v_by_store, 'evolution', v_evolution,
    'lastFourSameWeekday', v_same_wd, 'lastFourAll', v_all_last
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.products_in_decline(p_date_from date, p_date_to date, p_stores text[] DEFAULT '{}'::text[], p_deptos text[] DEFAULT '{}'::text[], p_secoes text[] DEFAULT '{}'::text[], p_prod_codes text[] DEFAULT '{}'::text[])
 RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path TO 'public'
AS $$
DECLARE v_result jsonb; v_hist_from date;
BEGIN
  IF NOT public.is_active_user(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  v_hist_from := p_date_from - INTERVAL '30 days';
  WITH recent AS (
    SELECT store_code, min(store_name) store_name, prod_code, min(prod_name) prod_name,
           min(depto) depto, min(secao) secao, sum(val_vda) sum_recent,
           count(DISTINCT sale_date) FILTER (WHERE val_vda > 0) days_with_sale_recent,
           max(sale_date) FILTER (WHERE val_vda > 0) last_sale_recent
    FROM public.sales
    WHERE sale_date BETWEEN p_date_from AND p_date_to
      AND (coalesce(array_length(p_stores,1),0)=0 OR store_code = ANY(p_stores))
      AND (coalesce(array_length(p_deptos,1),0)=0 OR depto = ANY(p_deptos))
      AND (coalesce(array_length(p_secoes,1),0)=0 OR secao = ANY(p_secoes))
      AND (coalesce(array_length(p_prod_codes,1),0)=0 OR prod_code = ANY(p_prod_codes))
    GROUP BY store_code, prod_code
  ), hist AS (
    SELECT store_code, prod_code, sum(val_vda) sum_hist,
           count(DISTINCT sale_date) FILTER (WHERE val_vda > 0) days_with_sale_hist,
           max(sale_date) FILTER (WHERE val_vda > 0) last_sale_hist
    FROM public.sales
    WHERE sale_date BETWEEN v_hist_from AND (p_date_from - INTERVAL '1 day')
    GROUP BY store_code, prod_code
  ), base AS (
    SELECT coalesce(r.store_code, h.store_code) AS store_code,
      r.store_name, r.prod_name, r.depto, r.secao,
      coalesce(r.prod_code, h.prod_code) AS prod_code,
      coalesce(r.sum_recent, 0) AS sum_recent,
      coalesce(r.days_with_sale_recent, 0) AS days_with_sale_recent,
      coalesce(h.sum_hist, 0) AS sum_hist,
      coalesce(h.days_with_sale_hist, 0) AS days_with_sale_hist,
      greatest(r.last_sale_recent, h.last_sale_hist) AS last_sale,
      (p_date_to - p_date_from + 1) AS days_recent_window,
      (p_date_from - v_hist_from) AS days_hist_window
    FROM recent r FULL OUTER JOIN hist h USING (store_code, prod_code)
    WHERE coalesce(h.days_with_sale_hist,0) >= 5
  ), enriched AS (
    SELECT b.*, (b.sum_hist / NULLIF(b.days_hist_window,0)) AS avg_daily_hist,
           (b.sum_recent / NULLIF(b.days_recent_window,0)) AS avg_daily_recent,
           (p_date_to - b.last_sale) AS days_without_sale
    FROM base b
  ), classified AS (
    SELECT e.*, CASE WHEN avg_daily_hist IS NULL OR avg_daily_hist = 0 THEN NULL
      ELSE ((avg_daily_recent - avg_daily_hist) / avg_daily_hist) END AS variation
    FROM enriched e
  ), final AS (
    SELECT c.*, CASE
        WHEN sum_recent = 0 AND days_with_sale_hist >= 5 THEN 'critico'
        WHEN variation IS NOT NULL AND variation <= -0.7 THEN 'alerta'
        WHEN variation IS NOT NULL AND variation <= -0.4 THEN 'atencao'
        ELSE 'ok' END AS status
    FROM classified c
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'store_code', store_code, 'store_name', store_name,
    'prod_code', prod_code, 'prod_name', prod_name,
    'depto', depto, 'secao', secao,
    'avg_daily_hist', avg_daily_hist, 'avg_daily_recent', avg_daily_recent,
    'sum_recent', sum_recent, 'sum_hist', sum_hist,
    'variation', variation, 'days_without_sale', days_without_sale,
    'last_sale_date', last_sale, 'status', status
  ) ORDER BY
    CASE status WHEN 'critico' THEN 0 WHEN 'alerta' THEN 1 WHEN 'atencao' THEN 2 ELSE 4 END,
    variation NULLS LAST
  ), '[]'::jsonb) INTO v_result
  FROM final WHERE status IN ('critico','alerta','atencao');
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.area_analysis(p_date_from date, p_date_to date, p_stores text[] DEFAULT '{}'::text[], p_deptos text[] DEFAULT '{}'::text[], p_secoes text[] DEFAULT '{}'::text[], p_grupos text[] DEFAULT '{}'::text[], p_subgrupos text[] DEFAULT '{}'::text[], p_prod_codes text[] DEFAULT '{}'::text[])
 RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path TO 'public'
AS $$
DECLARE
  v_total numeric; v_plus_total bigint; v_plus_with_sale bigint;
  v_products jsonb; v_has_hier boolean;
BEGIN
  IF NOT public.is_active_user(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  v_has_hier := COALESCE(array_length(p_deptos,1),0) > 0
             OR COALESCE(array_length(p_secoes,1),0) > 0
             OR COALESCE(array_length(p_grupos,1),0) > 0
             OR COALESCE(array_length(p_subgrupos,1),0) > 0
             OR COALESCE(array_length(p_prod_codes,1),0) > 0;

  WITH cur AS (
    SELECT prod_code, prod_name, depto, secao, grupo, subgrupo, val_vda, sale_date
      FROM public.sales
     WHERE sale_date BETWEEN p_date_from AND p_date_to
       AND (COALESCE(array_length(p_stores,1),0)=0    OR store_code = ANY(p_stores))
       AND (COALESCE(array_length(p_deptos,1),0)=0    OR depto      = ANY(p_deptos))
       AND (COALESCE(array_length(p_secoes,1),0)=0    OR secao      = ANY(p_secoes))
       AND (COALESCE(array_length(p_grupos,1),0)=0    OR grupo      = ANY(p_grupos))
       AND (COALESCE(array_length(p_subgrupos,1),0)=0 OR subgrupo   = ANY(p_subgrupos))
       AND (COALESCE(array_length(p_prod_codes,1),0)=0 OR prod_code = ANY(p_prod_codes))
  ), cur_agg AS (
    SELECT prod_code, min(prod_name) AS prod_name,
           min(depto) AS depto, min(secao) AS secao,
           min(grupo) AS grupo, min(subgrupo) AS subgrupo,
           sum(val_vda) AS val, count(*)::bigint AS qty
      FROM cur GROUP BY prod_code
  ), universe AS (
    SELECT prod_code, min(prod_name) AS prod_name,
           min(depto) AS depto, min(secao) AS secao,
           min(grupo) AS grupo, min(subgrupo) AS subgrupo
      FROM public.sales
     WHERE v_has_hier
       AND (COALESCE(array_length(p_stores,1),0)=0    OR store_code = ANY(p_stores))
       AND (COALESCE(array_length(p_deptos,1),0)=0    OR depto      = ANY(p_deptos))
       AND (COALESCE(array_length(p_secoes,1),0)=0    OR secao      = ANY(p_secoes))
       AND (COALESCE(array_length(p_grupos,1),0)=0    OR grupo      = ANY(p_grupos))
       AND (COALESCE(array_length(p_subgrupos,1),0)=0 OR subgrupo   = ANY(p_subgrupos))
       AND (COALESCE(array_length(p_prod_codes,1),0)=0 OR prod_code = ANY(p_prod_codes))
     GROUP BY prod_code
  ), joined AS (
    SELECT
      COALESCE(u.prod_code, c.prod_code) AS prod_code,
      COALESCE(u.prod_name, c.prod_name) AS prod_name,
      COALESCE(u.depto, c.depto) AS depto,
      COALESCE(u.secao, c.secao) AS secao,
      COALESCE(u.grupo, c.grupo) AS grupo,
      COALESCE(u.subgrupo, c.subgrupo) AS subgrupo,
      COALESCE(c.val, 0) AS val, COALESCE(c.qty, 0) AS qty
    FROM cur_agg c FULL OUTER JOIN universe u ON u.prod_code = c.prod_code
  ), last_sale AS (
    SELECT s.prod_code, max(s.sale_date) AS last_sale_date
      FROM public.sales s
     WHERE s.prod_code IN (SELECT prod_code FROM joined)
       AND (COALESCE(array_length(p_stores,1),0)=0 OR s.store_code = ANY(p_stores))
     GROUP BY s.prod_code
  ), final AS (
    SELECT j.*, ls.last_sale_date FROM joined j
      LEFT JOIN last_sale ls ON ls.prod_code = j.prod_code
  )
  SELECT
    COALESCE((SELECT sum(val) FROM cur_agg), 0),
    COALESCE((SELECT count(*) FROM final), 0)::bigint,
    COALESCE((SELECT count(*) FROM cur_agg WHERE val > 0), 0)::bigint,
    COALESCE(jsonb_agg(jsonb_build_object(
      'prod_code', prod_code, 'prod_name', prod_name,
      'depto', depto, 'secao', secao, 'grupo', grupo, 'subgrupo', subgrupo,
      'val', val, 'qty', qty, 'lastSaleDate', last_sale_date
    ) ORDER BY val DESC NULLS LAST, prod_code), '[]'::jsonb)
  INTO v_total, v_plus_total, v_plus_with_sale, v_products FROM final;

  RETURN jsonb_build_object(
    'total', v_total, 'plusTotal', v_plus_total,
    'plusWithSale', v_plus_with_sale,
    'plusWithoutSale', GREATEST(v_plus_total - v_plus_with_sale, 0),
    'avgPerPlu', CASE WHEN v_plus_with_sale > 0 THEN v_total / v_plus_with_sale ELSE 0 END,
    'products', v_products, 'byDate', '[]'::jsonb
  );
END;
$$;

-- ---------------------------------------------------------------------
-- 10. Criar admin inicial: auth.users + public.users
-- ---------------------------------------------------------------------
DO $$
DECLARE v_uid uuid := gen_random_uuid();
BEGIN
  INSERT INTO auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at, confirmation_token, email_change,
    email_change_token_new, recovery_token
  ) VALUES (
    v_uid, '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated',
    'admin@gpabr.com', crypt('CHANGE_ME_ADMIN_2026', gen_salt('bf')),  -- TODO: rotate in production via app.settings.admin_password
    now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
    now(), now(), '', '', '', ''
  );

  INSERT INTO auth.identities (
    id, user_id, provider_id, provider, identity_data,
    last_sign_in_at, created_at, updated_at
  ) VALUES (
    gen_random_uuid(), v_uid, v_uid::text, 'email',
    jsonb_build_object('sub', v_uid::text, 'email', 'admin@gpabr.com', 'email_verified', true),
    now(), now(), now()
  );

  INSERT INTO public.users (id, email, name, role, is_active)
  VALUES (v_uid, 'admin@gpabr.com', 'Administrador', 'admin', true);
END $$;
