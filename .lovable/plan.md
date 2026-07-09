
# Varredura de performance — resultados

Fiz o levantamento no banco (pg_stat_statements + pg_stat_user_tables + índices) e no código. Abaixo o que encontrei, em ordem de impacto.

## Diagnóstico

### 1. `dashboard_rankings.byProduto` escaneia a tabela `sales` inteira (2,68M linhas / 832 MB) a cada chamada
A parte `byProduto` da RPC agrupa `public.sales` — não usa `sales_daily_agg`. Como o dashboard chama a RPC em cada mudança de filtro/data e para o período anterior (comparação), isto sozinho gera a maior parte da lentidão no dashboard. Solução: criar tabela agregada por produto/dia (`sales_daily_prod_agg`) e usá-la no ranking.

### 2. `area_analysis` — paginação incompleta
Mesmo com `p_page`, a função monta o CTE `final` (FULL OUTER JOIN universo × período + `last_sale`) para **todos** os produtos do universo, depois faz `ORDER BY val LIMIT/OFFSET`. Quando o filtro é amplo (ex.: um departamento inteiro), gera dezenas de milhares de linhas antes de paginar. Além disso o `last_sale` faz `WHERE prod_code IN (SELECT … FROM joined)` (universo cheio) em vez de só os produtos da página atual.

### 3. `product_analysis` — 3 CTEs `agg_all` duplicados
A RPC repete a mesma agregação `SELECT sale_date, sum(val_vda) FROM sales WHERE prod_code=…` **três vezes** (evolution, same_wd, last_all). Cada chamada custa 3× o necessário.

### 4. Falta de cache client-side em queries "estáveis"
- `getFilterOptions` e `getAreaFilterHierarchy` mudam apenas em importação, mas rodam com `staleTime` curto (60s ou nem definido) e a cada mudança de filtro dependente.
- `getStores` / `getImportedDates` sem `staleTime`.
- Efeito: chamadas repetidas ao servidor mesmo quando a resposta seria idêntica.

### 5. `refresh_filter_hierarchy` faz TRUNCATE + INSERT completo em toda importação
Não é o gargalo diário, mas explica picos durante upload e invalida qualquer plano cacheado. Pode ser incremental por `sale_date`.

### Outras observações menores
- `is_active_user(auth.uid())` é chamado por toda RPC (9,9M idx_scan em `users`) — ok, mas dá pra colapsar com `has_role` em uma checagem só por request.
- Falta índice `sales(prod_code, sale_date, store_code)` para o `product_analysis` filtrado por loja.
- `products` sofre 680k UPDATEs por causa de upsert incondicional — usar `ON CONFLICT … DO UPDATE WHERE prod_name/last_seen IS DISTINCT FROM EXCLUDED` corta writes desnecessários.

## Plano de correção (ordem sugerida)

### Fase 1 — dashboard (maior ganho, menor risco)
1. Migration: nova tabela `public.sales_prod_daily_agg (sale_date, store_code, depto, secao, grupo, subgrupo, prod_code, prod_name, val_vda)` + índices por (sale_date), (sale_date, prod_code).
2. Migration: alterar `refresh_sales_daily_agg(p_date)` para popular também `sales_prod_daily_agg` (mesmo padrão de DELETE+INSERT por data). Backfill: rodar para todas as datas em `import_log`.
3. Migration: reescrever `dashboard_rankings.byProduto` para agregar em `sales_prod_daily_agg` em vez de `sales`.

### Fase 2 — área
4. Migration: reescrever `area_analysis` — quando `p_page IS NOT NULL`, aplicar `ORDER BY val LIMIT/OFFSET` **antes** de calcular `last_sale`, e calcular `last_sale` apenas para os `prod_code` da página. Manter comportamento antigo quando `p_page IS NULL` (export/PDF).
5. Índice complementar: `CREATE INDEX IF NOT EXISTS idx_sales_prod_store_date ON public.sales (prod_code, store_code, sale_date DESC)`.

### Fase 3 — produto
6. Migration: consolidar `product_analysis` em um único CTE `agg_all` reutilizado pelas três seleções (evolution/same_wd/last_all).

### Fase 4 — cache e writes
7. Frontend: elevar `staleTime` das queries estáveis:
   - `getFilterOptions`, `getAreaFilterHierarchy`, `getStores`, `getImportedDates`: `staleTime: 10 * 60_000`, `gcTime: 30 * 60_000`, `refetchOnWindowFocus: false`.
   - Configurar `defaultOptions` do QueryClient em `src/router.tsx` para reduzir refetchs oportunistas.
8. Upload: mudar upsert de `products` para condicional (`WHERE prod_name IS DISTINCT FROM EXCLUDED.prod_name OR last_seen < EXCLUDED.last_seen`) — corta ~680k updates por ciclo.
9. Migration opcional: `refresh_filter_hierarchy` incremental (DELETE por store+data e reinsert só do que mudou).

## Verificação após cada fase
- Rodar `supabase--slow_queries` de novo e comparar `total_ms` das queries alvo.
- Rodar `EXPLAIN (ANALYZE, BUFFERS)` nas RPCs críticas antes/depois.
- Testar no preview: dashboard com todos os filtros vazios, área com um departamento amplo, produto com histórico longo.

## O que não vou mexer sem confirmação
- Não vou reduzir retenção de `sales` (histórico completo).
- Não vou remover `sales_daily_agg` — as duas agregações coexistem (uma sem produto para KPIs por depto/loja, outra com produto para rankings).
- Não vou tocar em RLS/policies existentes.

Confirma que posso seguir por essa ordem (Fase 1 primeiro) ou prefere que eu priorize outra parte (ex.: começar pela análise de área, que é onde você sente mais lentidão)?
