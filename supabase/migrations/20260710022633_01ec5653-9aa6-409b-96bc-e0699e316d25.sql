CREATE OR REPLACE FUNCTION public.upsert_products_bulk(
  p_rows jsonb,
  p_sale_date date
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.products (prod_code, prod_name, last_seen)
  SELECT r->>'prod_code', r->>'prod_name', p_sale_date
  FROM jsonb_array_elements(p_rows) r
  ON CONFLICT (prod_code) DO UPDATE
    SET prod_name = EXCLUDED.prod_name,
        last_seen = GREATEST(products.last_seen, EXCLUDED.last_seen)
    WHERE products.prod_name IS DISTINCT FROM EXCLUDED.prod_name
       OR products.last_seen IS NULL
       OR products.last_seen < EXCLUDED.last_seen;
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_products_bulk(jsonb, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_products_bulk(jsonb, date) TO service_role;