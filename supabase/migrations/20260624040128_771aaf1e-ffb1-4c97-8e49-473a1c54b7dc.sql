
-- 1) Remove hardcoded admin bootstrap from handle_new_user
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (id, email, status)
  VALUES (NEW.id, NEW.email, 'pending'::public.user_status);
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'user'::public.app_role);
  RETURN NEW;
END;
$function$;

-- 2) Lock down SECURITY DEFINER functions in the public schema:
--    revoke from PUBLIC/anon; grant EXECUTE only to roles that need it.

-- App RPCs callable by signed-in approved users (functions perform is_approved check internally)
REVOKE ALL ON FUNCTION public.dashboard_metrics(date, date, text[], text[], text[], text[], text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dashboard_metrics(date, date, text[], text[], text[], text[], text[]) TO authenticated;

REVOKE ALL ON FUNCTION public.filter_options(date, date, text[], text[], text[], text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.filter_options(date, date, text[], text[], text[], text[]) TO authenticated;

REVOKE ALL ON FUNCTION public.dashboard_rankings(date, date, text[], text[], text[], text[], text[], integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dashboard_rankings(date, date, text[], text[], text[], text[], text[], integer) TO authenticated;

REVOKE ALL ON FUNCTION public.area_analysis(date, date, text[], text[], text[], text[], text[], text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.area_analysis(date, date, text[], text[], text[], text[], text[], text[]) TO authenticated;

REVOKE ALL ON FUNCTION public.product_analysis(text, text, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.product_analysis(text, text, date) TO authenticated;

REVOKE ALL ON FUNCTION public.product_search(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.product_search(text) TO authenticated;

REVOKE ALL ON FUNCTION public.products_in_decline(date, date, text[], text[], text[], text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.products_in_decline(date, date, text[], text[], text[], text[]) TO authenticated;

REVOKE ALL ON FUNCTION public.imported_dates() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.imported_dates() TO authenticated;

-- Used by RLS policies and admin checks — authenticated must keep EXECUTE
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;

REVOKE ALL ON FUNCTION public.is_approved(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_approved(uuid) TO authenticated;

-- Admin/server-only: called by service_role from server functions
REVOKE ALL ON FUNCTION public.refresh_sales_daily_agg(date) FROM PUBLIC, anon, authenticated;

-- Trigger functions: never invoked directly
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.touch_custom_analyses_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.bump_custom_analysis_parent() FROM PUBLIC, anon, authenticated;
