# Otimização de Carga — Plano de Ação

## Problema
Crescimento exponencial dos dados causa degradação de performance nas páginas de análise.

## Críticos Implementados

### #1 + #3: Paginação server-side na Análise de Área
**Migration:** `20260706184001_area_analysis_page.sql`
**Server function:** `getAreaAnalysis` em `analytics.functions.ts`
**Frontend:** `area.tsx`

**O que mudou:**
- RPC `area_analysis` aceita novos parâmetros opcionais: `p_page`, `p_page_size`, `p_search`, `p_sort_by`, `p_sort_dir`
- Quando `p_page IS NULL`: comportamento idêntico ao anterior (retorna todos os produtos)
- Quando `p_page IS NOT NULL`: retorna apenas 1 página, com busca textual e ordenação no servidor
- Frontend envia `search`, `sortKey`, `sortDir`, `page`, `pageSize` para o servidor
- `placeholderData: (prev) => prev` mantém dados anteriores durante refetch

### #2: Otimização `product_analysis`
**Migration:** `20260706184002_product_analysis_opt.sql`

**O que mudou:**
- `v_evolution` limitado às últimas 60 datas (antes: sem limite)
- 3 CTEs `agg` consolidadas em 1 CTE `agg_all` (1 scan ao invés de 3)

### #4: Hierarquia de filtros unificada
**Migration:** `20260706184003_area_filter_hierarchy.sql`
**Server function:** `getAreaFilterHierarchy` em `analytics.functions.ts`
**Frontend:** `area.tsx`

**O que mudou:**
- Nova RPC `area_filter_hierarchy()` retorna toda a hierarquia em 1 chamada
- 5 queries de filter-options substituídas por 1 única query
- Cascateamento de filtros feito no cliente via `filteredHierarchy()` + `dedupe()`

## Pendentes (não críticos)

### Dashboard: chamada única de métricas
- Unificar `dashboard_metrics` atual + anterior em 1 RPC (elimina 1 chamada)

### PDF export
- Já implementado: faz chamada sem paginação para exportar todos os dados
- Pode ser otimizado futuramente com streaming

### Upload: Worker thread
- Mover parse de XLSX para Web Worker (evita bloquear UI)

### React Query: config globais
- Adicionar `defaultStaleTime: 30s` no QueryClient
