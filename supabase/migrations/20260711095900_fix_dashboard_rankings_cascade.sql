
CREATE OR REPLACE FUNCTION public.dashboard_rankings(
  p_date_from date, p_date_to date,
  p_stores text[] DEFAULT '{}'::text[],
  p_deptos text[] DEFAULT '{}'::text[],
  p_secoes text[] DEFAULT '{}'::text[],
  p_grupos text[] DEFAULT '{}'::text[],
  p_subgrupos text[] DEFAULT '{}'::text[],
  p_limit integer DEFAULT 10
)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  v_depto jsonb; v_secao jsonb; v_grupo jsonb; v_subgrupo jsonb; v_produto jsonb;
BEGIN
  IF NOT public.is_active_user(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;

  WITH
  f_base AS (
    SELECT * FROM public.sales_daily_agg
    WHERE (p_date_from IS NULL OR sale_date >= p_date_from)
      AND (p_date_to   IS NULL OR sale_date <= p_date_to)
      AND (coalesce(array_length(p_stores,1),0)=0 OR store_code = ANY(p_stores))
  ),
  f_depto AS (
    SELECT * FROM f_base
    WHERE (coalesce(array_length(p_deptos,1),0)=0 OR depto = ANY(p_deptos))
  ),
  f_secao AS (
    SELECT * FROM f_base
    WHERE (coalesce(array_length(p_deptos,1),0)=0 OR depto = ANY(p_deptos))
      AND (coalesce(array_length(p_secoes,1),0)=0 OR secao = ANY(p_secoes))
  ),
  f_grupo AS (
    SELECT * FROM f_base
    WHERE (coalesce(array_length(p_deptos,1),0)=0 OR depto = ANY(p_deptos))
      AND (coalesce(array_length(p_secoes,1),0)=0 OR secao = ANY(p_secoes))
      AND (coalesce(array_length(p_grupos,1),0)=0 OR grupo = ANY(p_grupos))
  ),
  f_subgrupo AS (
    SELECT * FROM f_base
    WHERE (coalesce(array_length(p_deptos,1),0)=0 OR depto = ANY(p_deptos))
      AND (coalesce(array_length(p_secoes,1),0)=0 OR secao = ANY(p_secoes))
      AND (coalesce(array_length(p_grupos,1),0)=0 OR grupo = ANY(p_grupos))
      AND (coalesce(array_length(p_subgrupos,1),0)=0 OR subgrupo = ANY(p_subgrupos))
  )
  SELECT
    coalesce((SELECT jsonb_agg(jsonb_build_object('name', name, 'val', v) ORDER BY v DESC)
              FROM (SELECT coalesce(depto,'(sem)') name, sum(val_vda) v FROM f_depto GROUP BY depto ORDER BY 2 DESC LIMIT p_limit) x),'[]'::jsonb),
    coalesce((SELECT jsonb_agg(jsonb_build_object('name', name, 'val', v) ORDER BY v DESC)
              FROM (SELECT coalesce(secao,'(sem)') name, sum(val_vda) v FROM f_secao GROUP BY secao ORDER BY 2 DESC LIMIT p_limit) x),'[]'::jsonb),
    coalesce((SELECT jsonb_agg(jsonb_build_object('name', name, 'val', v) ORDER BY v DESC)
              FROM (SELECT coalesce(grupo,'(sem)') name, sum(val_vda) v FROM f_grupo GROUP BY grupo ORDER BY 2 DESC LIMIT p_limit) x),'[]'::jsonb),
    coalesce((SELECT jsonb_agg(jsonb_build_object('name', name, 'val', v) ORDER BY v DESC)
              FROM (SELECT coalesce(subgrupo,'(sem)') name, sum(val_vda) v FROM f_subgrupo GROUP BY subgrupo ORDER BY 2 DESC LIMIT p_limit) x),'[]'::jsonb),
    '[]'::jsonb
  INTO v_depto, v_secao, v_grupo, v_subgrupo, v_produto;

  WITH fp AS (
    SELECT * FROM public.sales_prod_daily_agg
    WHERE (p_date_from IS NULL OR sale_date >= p_date_from)
      AND (p_date_to IS NULL OR sale_date <= p_date_to)
      AND (coalesce(array_length(p_stores,1),0)=0    OR store_code = ANY(p_stores))
      AND (coalesce(array_length(p_deptos,1),0)=0    OR depto      = ANY(p_deptos))
      AND (coalesce(array_length(p_secoes,1),0)=0    OR secao      = ANY(p_secoes))
      AND (coalesce(array_length(p_grupos,1),0)=0    OR grupo      = ANY(p_grupos))
      AND (coalesce(array_length(p_subgrupos,1),0)=0 OR subgrupo   = ANY(p_subgrupos))
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object('code', prod_code, 'name', prod_name, 'val', v) ORDER BY v DESC),'[]'::jsonb)
  INTO v_produto
  FROM (SELECT prod_code, min(prod_name) prod_name, sum(val_vda) v
        FROM fp GROUP BY prod_code ORDER BY 3 DESC LIMIT p_limit) x;

  RETURN jsonb_build_object(
    'byDepto', v_depto, 'bySecao', v_secao,
    'byGrupo', v_grupo, 'bySubgrupo', v_subgrupo,
    'byProduto', v_produto
  );
END $function$;
