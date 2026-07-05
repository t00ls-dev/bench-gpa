
-- Fix: lastSaleDate na area_analysis agora respeita p_date_to
-- Antes, a CTE last_sale buscava o max(sale_date) sem filtrar por p_date_to,
-- fazendo com que vendas FUTURAS ao período analisado fossem consideradas.
-- O clamp `diff < 0 ? 0` no frontend escondia o problema, mas produtos que
-- realmente não venderam no último dia do período apareciam com 0 dias sem venda.

CREATE OR REPLACE FUNCTION public.area_analysis(p_date_from date, p_date_to date, p_stores text[] DEFAULT '{}'::text[], p_deptos text[] DEFAULT '{}'::text[], p_secoes text[] DEFAULT '{}'::text[], p_grupos text[] DEFAULT '{}'::text[], p_subgrupos text[] DEFAULT '{}'::text[], p_prod_codes text[] DEFAULT '{}'::text[])
 RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path TO 'public'
AS $$
DECLARE
  v_total numeric; v_plus_total bigint; v_plus_with_sale bigint;
  v_products jsonb; v_has_hier boolean;
BEGIN
  IF NOT public.is_active_user(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  v_has_hier := COALESCE(array_length(p_deptos,1),0) > 0
             OR COALESCE(array_length(p_secoes,1),0) > 0
             OR COALESCE(array_length(p_grupos,1),0) > 0
             OR COALESCE(array_length(p_subgrupos,1),0) > 0
             OR COALESCE(array_length(p_prod_codes,1),0) > 0;

  WITH cur AS (
    SELECT prod_code, prod_name, depto, secao, grupo, subgrupo, val_vda, sale_date
      FROM public.sales
     WHERE sale_date BETWEEN p_date_from AND p_date_to
       AND (COALESCE(array_length(p_stores,1),0)=0    OR store_code = ANY(p_stores))
       AND (COALESCE(array_length(p_deptos,1),0)=0    OR depto      = ANY(p_deptos))
       AND (COALESCE(array_length(p_secoes,1),0)=0    OR secao      = ANY(p_secoes))
       AND (COALESCE(array_length(p_grupos,1),0)=0    OR grupo      = ANY(p_grupos))
       AND (COALESCE(array_length(p_subgrupos,1),0)=0 OR subgrupo   = ANY(p_subgrupos))
       AND (COALESCE(array_length(p_prod_codes,1),0)=0 OR prod_code = ANY(p_prod_codes))
  ), cur_agg AS (
    SELECT prod_code, min(prod_name) AS prod_name,
           min(depto) AS depto, min(secao) AS secao,
           min(grupo) AS grupo, min(subgrupo) AS subgrupo,
           sum(val_vda) AS val, count(*)::bigint AS qty
      FROM cur GROUP BY prod_code
  ), universe AS (
    SELECT prod_code, min(prod_name) AS prod_name,
           min(depto) AS depto, min(secao) AS secao,
           min(grupo) AS grupo, min(subgrupo) AS subgrupo
      FROM public.sales
     WHERE v_has_hier
       AND (COALESCE(array_length(p_stores,1),0)=0    OR store_code = ANY(p_stores))
       AND (COALESCE(array_length(p_deptos,1),0)=0    OR depto      = ANY(p_deptos))
       AND (COALESCE(array_length(p_secoes,1),0)=0    OR secao      = ANY(p_secoes))
       AND (COALESCE(array_length(p_grupos,1),0)=0    OR grupo      = ANY(p_grupos))
       AND (COALESCE(array_length(p_subgrupos,1),0)=0 OR subgrupo   = ANY(p_subgrupos))
       AND (COALESCE(array_length(p_prod_codes,1),0)=0 OR prod_code = ANY(p_prod_codes))
     GROUP BY prod_code
  ), joined AS (
    SELECT
      COALESCE(u.prod_code, c.prod_code) AS prod_code,
      COALESCE(u.prod_name, c.prod_name) AS prod_name,
      COALESCE(u.depto, c.depto) AS depto,
      COALESCE(u.secao, c.secao) AS secao,
      COALESCE(u.grupo, c.grupo) AS grupo,
      COALESCE(u.subgrupo, c.subgrupo) AS subgrupo,
      COALESCE(c.val, 0) AS val, COALESCE(c.qty, 0) AS qty
    FROM cur_agg c FULL OUTER JOIN universe u ON u.prod_code = c.prod_code
  ), last_sale AS (
    SELECT s.prod_code, max(s.sale_date) AS last_sale_date
      FROM public.sales s
     WHERE s.prod_code IN (SELECT prod_code FROM joined)
       AND s.sale_date <= p_date_to
       AND (COALESCE(array_length(p_stores,1),0)=0 OR s.store_code = ANY(p_stores))
     GROUP BY s.prod_code
  ), final AS (
    SELECT j.*, ls.last_sale_date FROM joined j
      LEFT JOIN last_sale ls ON ls.prod_code = j.prod_code
  )
  SELECT
    COALESCE((SELECT sum(val) FROM cur_agg), 0),
    COALESCE((SELECT count(*) FROM final), 0)::bigint,
    COALESCE((SELECT count(*) FROM cur_agg WHERE val > 0), 0)::bigint,
    COALESCE(jsonb_agg(jsonb_build_object(
      'prod_code', prod_code, 'prod_name', prod_name,
      'depto', depto, 'secao', secao, 'grupo', grupo, 'subgrupo', subgrupo,
      'val', val, 'qty', qty, 'lastSaleDate', last_sale_date
    ) ORDER BY val DESC NULLS LAST, prod_code), '[]'::jsonb)
  INTO v_total, v_plus_total, v_plus_with_sale, v_products FROM final;

  RETURN jsonb_build_object(
    'total', v_total, 'plusTotal', v_plus_total,
    'plusWithSale', v_plus_with_sale,
    'plusWithoutSale', GREATEST(v_plus_total - v_plus_with_sale, 0),
    'avgPerPlu', CASE WHEN v_plus_with_sale > 0 THEN v_total / v_plus_with_sale ELSE 0 END,
    'products', v_products, 'byDate', '[]'::jsonb
  );
END;
$$;
