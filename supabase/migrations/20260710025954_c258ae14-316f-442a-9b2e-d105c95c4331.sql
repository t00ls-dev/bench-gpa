
REVOKE EXECUTE ON FUNCTION public.refresh_filter_hierarchy() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.refresh_sales_daily_agg(date) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.finalize_import(uuid, date, integer, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.upsert_products_bulk(jsonb, date) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.refresh_filter_hierarchy() TO service_role;
GRANT EXECUTE ON FUNCTION public.refresh_sales_daily_agg(date) TO service_role;
GRANT EXECUTE ON FUNCTION public.finalize_import(uuid, date, integer, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.upsert_products_bulk(jsonb, date) TO service_role;
