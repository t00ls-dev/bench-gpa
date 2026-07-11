
-- =====================================================================
-- Otimização RLS: envolve auth.uid() em (SELECT ...) para ser
-- avaliado 1 vez por query, não N vezes (uma por linha).
-- =====================================================================

-- ---------------------------------------------------------------------
-- users
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "users_self_select" ON public.users;
CREATE POLICY "users_self_select" ON public.users
  FOR SELECT TO authenticated
  USING (id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "users_admin_select" ON public.users;
CREATE POLICY "users_admin_select" ON public.users
  FOR SELECT TO authenticated
  USING ((SELECT public.has_role(auth.uid(), 'admin')));

-- ---------------------------------------------------------------------
-- sales
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "sales_select_active" ON public.sales;
CREATE POLICY "sales_select_active" ON public.sales
  FOR SELECT TO authenticated
  USING ((SELECT public.is_active_user(auth.uid())));

DROP POLICY IF EXISTS "sales_admin_all" ON public.sales;
CREATE POLICY "sales_admin_all" ON public.sales
  FOR ALL TO authenticated
  USING ((SELECT public.has_role(auth.uid(), 'admin')))
  WITH CHECK ((SELECT public.has_role(auth.uid(), 'admin')));

-- ---------------------------------------------------------------------
-- sales_daily_agg
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "sda_select_active" ON public.sales_daily_agg;
CREATE POLICY "sda_select_active" ON public.sales_daily_agg
  FOR SELECT TO authenticated
  USING ((SELECT public.is_active_user(auth.uid())));

DROP POLICY IF EXISTS "sda_admin_all" ON public.sales_daily_agg;
CREATE POLICY "sda_admin_all" ON public.sales_daily_agg
  FOR ALL TO authenticated
  USING ((SELECT public.has_role(auth.uid(), 'admin')))
  WITH CHECK ((SELECT public.has_role(auth.uid(), 'admin')));

-- ---------------------------------------------------------------------
-- products
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "products_select_active" ON public.products;
CREATE POLICY "products_select_active" ON public.products
  FOR SELECT TO authenticated
  USING ((SELECT public.is_active_user(auth.uid())));

-- ---------------------------------------------------------------------
-- stores
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "stores_select_active" ON public.stores;
CREATE POLICY "stores_select_active" ON public.stores
  FOR SELECT TO authenticated
  USING ((SELECT public.is_active_user(auth.uid())));

-- ---------------------------------------------------------------------
-- import_log
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "import_log_select_active" ON public.import_log;
CREATE POLICY "import_log_select_active" ON public.import_log
  FOR SELECT TO authenticated
  USING ((SELECT public.is_active_user(auth.uid())));

DROP POLICY IF EXISTS "import_log_admin_all" ON public.import_log;
CREATE POLICY "import_log_admin_all" ON public.import_log
  FOR ALL TO authenticated
  USING ((SELECT public.has_role(auth.uid(), 'admin')))
  WITH CHECK ((SELECT public.has_role(auth.uid(), 'admin')));

-- ---------------------------------------------------------------------
-- filter_hierarchy
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "filter_hierarchy_select_active" ON public.filter_hierarchy;
CREATE POLICY "filter_hierarchy_select_active" ON public.filter_hierarchy
  FOR SELECT TO authenticated
  USING ((SELECT public.is_active_user(auth.uid())));

-- ---------------------------------------------------------------------
-- sales_prod_daily_agg
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "spda_select_active" ON public.sales_prod_daily_agg;
CREATE POLICY "spda_select_active" ON public.sales_prod_daily_agg
  FOR SELECT TO authenticated
  USING ((SELECT public.is_active_user(auth.uid())));

DROP POLICY IF EXISTS "spda_admin_all" ON public.sales_prod_daily_agg;
CREATE POLICY "spda_admin_all" ON public.sales_prod_daily_agg
  FOR ALL TO authenticated
  USING ((SELECT public.has_role(auth.uid(), 'admin'::public.app_role)))
  WITH CHECK ((SELECT public.has_role(auth.uid(), 'admin'::public.app_role)));

