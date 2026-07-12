-- Remove RPCs que não têm consumidor no código fonte
DROP FUNCTION IF EXISTS public.products_in_decline(date,date,text[],text[],text[],text[],text[],integer,numeric,integer);
DROP FUNCTION IF EXISTS public.refresh_sales_daily_agg(date);
