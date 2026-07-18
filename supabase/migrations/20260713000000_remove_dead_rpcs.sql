-- Remove RPCs que não têm consumidor no código fonte
-- NOTA: products_in_decline tinha assinatura original de 6 params (não 10 da migração 20260711220000 que nunca foi aplicada)
-- Drop executado manualmente via Management API em 18/07/2026 com a assinatura correta:
-- DROP FUNCTION IF EXISTS public.products_in_decline(date, date, text[], text[], text[], text[]);
DROP FUNCTION IF EXISTS public.products_in_decline(date, date, text[], text[], text[], text[]);
DROP FUNCTION IF EXISTS public.refresh_sales_daily_agg(date);
