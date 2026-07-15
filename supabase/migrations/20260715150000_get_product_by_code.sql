CREATE OR REPLACE FUNCTION public.get_product_by_code(p_code text)
 RETURNS TABLE(prod_code text, prod_name text)
 LANGUAGE sql STABLE SET search_path TO 'public'
AS $$
  SELECT prod_code, prod_name FROM public.products
  WHERE public.is_active_user(auth.uid())
    AND prod_code = p_code
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_product_by_code(text) TO authenticated;
