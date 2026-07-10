# Estado Atual do Código

Diagnóstico baseado na leitura completa dos fontes (julho/2026).

---

## Rotas

### `/auth` — Login (`src/routes/auth.tsx`)
- Login email/senha com Supabase Auth
- Verifica se usuário está ativo (`is_active`) após login bem-sucedido
- Redireciona para `?next=` ou `/` via `sanitizeNext()` (proteção contra open redirect)
- `ssr: false` — intencional (depende de Supabase client-side)
- **Sem** "Esqueci minha senha", "Lembrar email", rate limiting, 2FA

### `/` — Dashboard (`src/routes/_authenticated/index.tsx`)
- 1 KPI (Venda total) com delta vs período anterior
- Gráfico: evolução diária (LineChart) e top lojas (BarChart)
- Rankings: 5 RankingCards (depto, secao, grupo, subgrupo, produtos) — limitados a 10 itens
- Filtros via `FilterBar` com `usePersistentState`
- 3 chamadas server function paralelas: `getDashboard`, `getDashboardRankings`, `getFilterOptions`
- **Dado não utilizado**: `data.previous.byDate` é retornado pelo RPC mas não renderizado
- **Sem** comparação visual com período anterior, sem skeletons nos rankings durante primeiro load, sem `placeholderData`

### `/produto` — Análise de Produto (`src/routes/_authenticated/produto.tsx`)
- Busca com debounce (250ms) por PLU ou nome
- KPIs: valor na data de referência, média histórica mesmo dia da semana (com delta), média diária
- Gráficos: comparação por loja (BarChart) e evolução (LineChart)
- Tabelas históricas paginadas (10 por página): mesmo dia da semana + completo
- Suporte a `?plu=` na URL para deep linking
- **Sem** multi-loja, export CSV/XLSX, linha de tendência, `placeholderData`

### `/area` — Análise de Área (`src/routes/_authenticated/area.tsx` — 773 linhas)
- **Server-side pagination** implementada (page, pageSize, search, sortBy, sortDir)
- **Filtro hierárquico unificado** via `getAreaFilterHierarchy` (1 chamada, cascata no cliente)
- KPIs: Venda Total, PLUs área, PLUs com venda, PLUs sem venda, Venda média por PLU
- Tabela sortável, paginação configurável (25/50/100/250)
- PDF export com jsPDF (todas as linhas, sem paginação)
- `placeholderData: (prev) => prev` — única rota com isso
- **Problemas**: 773 linhas no componente, `filteredHierarchy` chamado 2x com mesmos args, PDF com colunas "QTD" e "VALIDADE" sempre vazias

### `/upload` — Upload XLSX (`src/routes/_authenticated/upload.tsx`)
- Drag-and-drop, valida tamanho (50MB) e linhas (500k)
- Pipeline: parse (main thread) → beginImport → insertSalesChunk (1000 linhas) → finalizeImport
- Progresso por arquivo (velocidade, ETA, barra)
- Wake Lock API (impede suspensão)
- Calendário de importações, tabela de histórico
- **Sem** Web Worker, cancelar, pausar/retomar, preview, validação de schema

### `/admin` — Gestão de Usuários (`src/routes/_authenticated/admin.tsx`)
- Lista de usuários, criar (com sufixo @gpabr.com), toggle ativo/admin, reset senha
- Seção Diagnose/Repair (contagem de registros, rebuild de agregações)
- Double-gated: `beforeLoad` + `<AdminGate>` + `assertAdmin` server-side
- **Sem** confirmação em ações destrutivas, loading inline no Switch, busca/filtro na lista, paginação, auditoria

---

## Server Functions

### `analytics.functions.ts` (10 funções)
- `getDashboard` faz **2 chamadas RPC** (período atual + anterior) — poderia ser 1
- `getAreaAnalysis` com paginação/sorting/search server-side
- `getAreaFilterHierarchy` substitui 5 queries individuais
- Parsing defensivo via `asRecord`/`asArray`/`num()`/`str()` — belt-and-suspenders

### `admin.functions.ts` (7 funções)
- `assertAdmin` implementado inline (duplicado em `upload.functions.ts`)
- `createUser` com rollback manual (apaga auth user se insert na tabela falhar)
- `repairAggregations`: itera datas individualmente — lento para muitos dias

### `upload.functions.ts` (3 funções)
- Pipeline trifásico com atomic swap via RPC `finalize_import`
- `upsert_products_bulk` RPC evita "URI too large" do PostgREST
- **`assertAdmin` idêntico ao de `admin.functions.ts`** — duplicado

---

## Componentes

| Componente | Estado |
|---|---|
| `FilterBar` | Funcional com cascata, seeds data range, re-clampa datas disponíveis |
| `DateRangePicker` | Presets + calendário, clamping a datas disponíveis |
| `ImportCalendar` | Heatmap mensal, cores hardcoded (quebra dark mode) |
| `KpiCard` | Delta badge com cores OKLCH hardcoded (quebra dark mode) |
| `RankingCard` | Skeleton, empty state — sem problemas, mas pai não passa `isLoading` corretamente no 1o load |
| `MultiSelect` | Sem navegação por teclado, sem ARIA roles nos checkboxes customizados |
| `LastUpdateInfo` | Busca **todas** as datas só pra achar a última; cores hardcoded no banner stale |
| `AdminGate` | Sem tratamento de erro de rede (cai em "deny" permanentemente) |

---

## Infraestrutura

- **Auth middleware**: `auth-middleware.ts` valida Bearer token, injeta `supabase` + `userId` + `claims`
- **Auth attacher**: `auth-attacher.ts` anexa token às serverFn client-side
- **Cliente Supabase dual**: `client.ts` (anon, Proxy lazy singleton) + `client.server.ts` (service role, dynamic import)
- **Segurança**: CSP `frame-ancestors 'none'`, X-Frame-Options, nosniff, Referrer-Policy
- **Error handling**: `safeError()` + `error-capture.ts` + `normalizeCatastrophicSsrResponse()`
- **CSS**: Tailwind v4 com OKLCH, `@theme inline`, `@utility kpi-card`. **Sem variáveis `.dark`** — dark mode não implementado

---

## Banco de Dados (tipos em `types.ts`)

### Tabelas (8)
`sales`, `products`, `stores`, `users`, `import_log`, `filter_hierarchy`, `sales_daily_agg`, `staging_sales`

### RPCs (16)
`dashboard_metrics`, `dashboard_rankings`, `filter_options`, `area_analysis`, `area_filter_hierarchy`, `product_analysis`, `product_search`, `products_in_decline`, `imported_dates`, `has_role`, `finalize_import`, `upsert_products_bulk`, `refresh_filter_hierarchy`, `refresh_sales_daily_agg`, `show_limit`, `show_trgm`
