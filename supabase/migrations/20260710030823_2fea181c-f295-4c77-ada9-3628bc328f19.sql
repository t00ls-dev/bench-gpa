ALTER FUNCTION public.finalize_import(uuid, date, integer, uuid) SET statement_timeout = '5min';
ALTER FUNCTION public.refresh_sales_daily_agg(date) SET statement_timeout = '5min';
ALTER FUNCTION public.refresh_filter_hierarchy() SET statement_timeout = '2min';
ALTER FUNCTION public.upsert_products_bulk(jsonb, date) SET statement_timeout = '2min';