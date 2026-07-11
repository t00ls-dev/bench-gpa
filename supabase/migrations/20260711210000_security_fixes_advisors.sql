
-- =====================================================================
-- Correções apontadas pelo supabase db advisors:
-- 1. rls_auto_enable — SECURITY DEFINER executável por anon/authenticated
-- 2. Duplicate index sales_date_idx em sales (idêntico a idx_sales_sale_date)
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. rls_auto_enable: revoga EXECUTE de PUBLIC/anon/authenticated
--    (função usada apenas pelo event trigger ensure_rls, não por usuários)
-- ---------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------
-- 2. Dropar índice duplicado em sales (sales_date_idx = idx_sales_sale_date)
-- ---------------------------------------------------------------------
DROP INDEX IF EXISTS public.sales_date_idx;

