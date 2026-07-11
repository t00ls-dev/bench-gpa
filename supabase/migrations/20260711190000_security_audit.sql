
-- =====================================================================
-- Auditoria de segurança:
-- 1. Habilita RLS em sales_daily_agg + GRANT SELECT para authenticated
-- 2. Policy para staging_sales (sem policy, RLS bloqueia tudo)
-- 3. Revoga grants INSERT/UPDATE/DELETE excessivos de authenticated
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. sales_daily_agg
-- ---------------------------------------------------------------------
ALTER TABLE public.sales_daily_agg ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.sales_daily_agg TO authenticated;

-- ---------------------------------------------------------------------
-- 2. staging_sales: policy default-deny para service_role
--    (RLS sem policy bloqueia tudo, inclusive service_role via REST)
-- ---------------------------------------------------------------------
CREATE POLICY "staging_sales_service_role_all" ON public.staging_sales
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- ---------------------------------------------------------------------
-- 3. Revoga grants INSERT/UPDATE/DELETE excessivos de authenticated
--    (SELECT é suficiente; escritas só via SECURITY DEFINER functions)
-- ---------------------------------------------------------------------
REVOKE INSERT, UPDATE, DELETE ON public.products   FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.stores     FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.sales      FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.import_log FROM authenticated;

