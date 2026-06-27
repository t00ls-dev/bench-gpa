
ALTER FUNCTION public.filter_options(date, date, text[], text[], text[], text[]) SECURITY INVOKER;
ALTER FUNCTION public.dashboard_metrics(date, date, text[], text[], text[], text[], text[]) SECURITY INVOKER;
ALTER FUNCTION public.dashboard_rankings(date, date, text[], text[], text[], text[], text[], integer) SECURITY INVOKER;
ALTER FUNCTION public.area_analysis(date, date, text[], text[], text[], text[], text[], text[]) SECURITY INVOKER;
ALTER FUNCTION public.product_analysis(text, text, date) SECURITY INVOKER;
ALTER FUNCTION public.product_search(text) SECURITY INVOKER;
ALTER FUNCTION public.products_in_decline(date, date, text[], text[], text[], text[]) SECURITY INVOKER;
ALTER FUNCTION public.imported_dates() SECURITY INVOKER;

-- Revoke EXECUTE from anon for all RPCs (only authenticated approved users should call them)
REVOKE EXECUTE ON FUNCTION public.filter_options(date, date, text[], text[], text[], text[]) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.dashboard_metrics(date, date, text[], text[], text[], text[], text[]) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.dashboard_rankings(date, date, text[], text[], text[], text[], text[], integer) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.area_analysis(date, date, text[], text[], text[], text[], text[], text[]) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.product_analysis(text, text, date) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.product_search(text) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.products_in_decline(date, date, text[], text[], text[], text[]) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.imported_dates() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.refresh_sales_daily_agg(date) FROM anon, authenticated, PUBLIC;

GRANT EXECUTE ON FUNCTION public.filter_options(date, date, text[], text[], text[], text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dashboard_metrics(date, date, text[], text[], text[], text[], text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dashboard_rankings(date, date, text[], text[], text[], text[], text[], integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.area_analysis(date, date, text[], text[], text[], text[], text[], text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.product_analysis(text, text, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.product_search(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.products_in_decline(date, date, text[], text[], text[], text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.imported_dates() TO authenticated;
