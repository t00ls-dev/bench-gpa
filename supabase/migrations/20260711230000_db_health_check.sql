
-- =====================================================================
-- RPC de health check do banco: tamanho total, uso por tabela,
-- estimativa de linhas, conexões ativas, % do limite free (500 MB)
-- =====================================================================

CREATE OR REPLACE FUNCTION public.db_health_check()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_db_size bigint;
  v_free_limit bigint := 524288000; -- 500 MB em bytes
  v_pct_used numeric;
  v_tables jsonb;
  v_version text;
  v_connections integer;
BEGIN
  SELECT pg_database_size(current_database()) INTO v_db_size;
  v_pct_used := round((v_db_size::numeric / v_free_limit) * 100, 1);

  SELECT substring(version() from 'PostgreSQL ([\d.]+)') INTO v_version;

  SELECT count(*)::int INTO v_connections
  FROM pg_stat_activity WHERE state = 'active';

  SELECT jsonb_agg(jsonb_build_object(
    'table', t.tablename,
    'schema', t.schemaname,
    'total_size', pg_total_relation_size((quote_ident(t.schemaname)||'.'||quote_ident(t.tablename))::regclass),
    'total_size_pretty', pg_size_pretty(pg_total_relation_size((quote_ident(t.schemaname)||'.'||quote_ident(t.tablename))::regclass)),
    'row_estimate', GREATEST(0, round(c.reltuples)::bigint)
  ) ORDER BY pg_total_relation_size((quote_ident(t.schemaname)||'.'||quote_ident(t.tablename))::regclass) DESC)
  INTO v_tables
  FROM pg_tables t
  JOIN pg_class c ON c.relname = t.tablename
    AND c.relnamespace = (quote_ident(t.schemaname))::regnamespace
  WHERE t.schemaname IN ('public', 'auth')
    AND c.relkind = 'r'
    AND t.tablename NOT LIKE 'pg_%'
    AND t.tablename NOT LIKE '_prisma_%'
    AND t.tablename NOT LIKE '_tracking_%';

  RETURN jsonb_build_object(
    'db_size', v_db_size,
    'db_size_pretty', pg_size_pretty(v_db_size),
    'free_limit', v_free_limit,
    'free_limit_pretty', '500 MB',
    'pct_used', v_pct_used,
    'version', v_version,
    'active_connections', v_connections,
    'tables', COALESCE(v_tables, '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.db_health_check() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.db_health_check() TO authenticated, service_role;
