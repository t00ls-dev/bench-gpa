
REVOKE EXECUTE ON FUNCTION public.imported_dates() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.filter_options(date,date) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.dashboard_metrics(date,date,text[],text[],text[],text[],text[]) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.product_search(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.product_analysis(text,text,date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.imported_dates() TO authenticated;
GRANT EXECUTE ON FUNCTION public.filter_options(date,date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dashboard_metrics(date,date,text[],text[],text[],text[],text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.product_search(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.product_analysis(text,text,date) TO authenticated;
