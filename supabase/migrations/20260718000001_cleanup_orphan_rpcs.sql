-- Cleanup: remove orphan RPCs and dead infra
-- custom_analysis tables were already dropped; orphan trigger functions remain
-- email queue infra was never used

-- ============================================================
-- 1. Orphan trigger functions (custom_analysis — tables dropped)
-- ============================================================
DROP FUNCTION IF EXISTS public.bump_custom_analysis_parent CASCADE;
DROP FUNCTION IF EXISTS public.touch_custom_analyses_updated_at CASCADE;

-- ============================================================
-- 2. RPCs never called from code
-- ============================================================
DROP FUNCTION IF EXISTS public.area_product_options CASCADE;

-- ============================================================
-- 3. Email queue infra (never used)
-- ============================================================
DROP FUNCTION IF EXISTS public.enqueue_email CASCADE;
DROP FUNCTION IF EXISTS public.read_email_batch CASCADE;
DROP FUNCTION IF EXISTS public.delete_email CASCADE;
DROP FUNCTION IF EXISTS public.move_to_dlq CASCADE;

DROP TABLE IF EXISTS public.email_send_log CASCADE;
DROP TABLE IF EXISTS public.email_send_state CASCADE;

-- ============================================================
-- 4. Supabase types — is_active_user not called frontend
-- Keep function in DB (used as dependency by has_role internally),
-- just remove from types.ts later
-- ============================================================
-- is_active_user is kept; has_role depends on it internally
