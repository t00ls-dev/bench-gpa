
-- refresh_filter_hierarchy: keep as SECURITY DEFINER (needs to TRUNCATE) but restrict execution to service_role only
REVOKE ALL ON FUNCTION public.refresh_filter_hierarchy() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_filter_hierarchy() TO service_role;

-- refresh_sales_daily_agg: same treatment
REVOKE ALL ON FUNCTION public.refresh_sales_daily_agg(date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_sales_daily_agg(date) TO service_role;
