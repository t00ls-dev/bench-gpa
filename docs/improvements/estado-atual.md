# Estado Atual do Código

Diagnóstico baseado na leitura completa dos fontes (julho/2026). Migração **Supabase → MariaDB + JWT próprio** concluída ✅.

> **Implementado na migração**: CSP nonce, rate limiting sliding window (4 tiers), Turnstile CAPTCHA, cache layer (SimpleCache), command palette (cmdk), atalhos de teclado (g+letra), navegação mobile (bottom tab bar + vaul Drawer), View Transitions API, exportação PDF (Dashboard + Produto + Área).

---

## Rotas

### `/auth` — Login (`src/routes/auth.page.tsx`)

- Login email/senha com JWT próprio (bcrypt + jsonwebtoken)
- Verifica se usuário está ativo (`is_active`) após login bem-sucedido
- **Cloudflare Turnstile** integrado (non-interactive, fail-closed, 2 retries, bypass env)
- **Rate limiting**: tier Auth (5/min IP, 20/min global)
- Redireciona para `?next=` ou `/` via `sanitizeNext()` (proteção contra open redirect)
- **Sem** "Esqueci minha senha", "Lembrar email", 2FA

### `/` — Dashboard (`src/routes/_authenticated/index.page.tsx`, 234 linhas)

- 1 KPI (Venda total) com delta vs período anterior
- Gráfico: evolução diária (LineChart) e top lojas (BarChart)
- Rankings: 5 RankingCards (depto, secao, grupo, subgrupo, produtos) — limitados a 10 itens
- Filtros via `FilterDrawer` com `usePersistentState`
- **Exportação PDF** (jspdf) com período, filtros, KPI e rankings
- 3 chamadas server function paralelas: `getDashboard`, `getDashboardRankings`, `getFilterOptions`
- **Dado não utilizado**: `data.previous.byDate` é retornado pelo RPC mas não renderizado
- **Sem** comparação visual com período anterior, sem skeletons nos rankings durante primeiro load, sem `placeholderData`

### `/produto` — Análise de Produto (`src/routes/_authenticated/produto.page.tsx`, 255 linhas)

- Busca com debounce (250ms) por PLU ou nome
- KPIs: valor na data de referência, média histórica mesmo dia da semana (com delta), média diária
- Gráficos: comparação por loja (BarChart) e evolução (LineChart)
- Tabelas históricas paginadas (10 por página): mesmo dia da semana + completo
- Suporte a `?plu=` na URL para deep linking
- **Exportação PDF** (jspdf) com produto, KPIs e tabela de evolução
- **Sem** multi-loja, export CSV/XLSX, linha de tendência, `placeholderData`

### `/area` — Análise de Área (`src/routes/_authenticated/area.page.tsx` — 295 linhas)

- **Server-side pagination** (page, pageSize, search, sortBy, sortDir)
- **Filtro hierárquico unificado** via `getAreaFilterHierarchy` (1 chamada, cascata no cliente)
- **Tabela virtualizada** com `@tanstack/react-virtual`
- KPIs: Venda Total, PLUs área, PLUs com venda, PLUs sem venda, Venda média por PLU
- Tabela sortável, paginação configurável (25/50/100/250)
- PDF export com jsPDF (todas as linhas, sem paginação)
- `placeholderData: (prev) => prev` — única rota com isso
- **Problemas**: `filteredHierarchy` chamado 2x com mesmos args, PDF com colunas "QTD" e "VALIDADE" sempre vazias

### `/upload` — Importação XLSX (`src/routes/_authenticated/upload.page.tsx`, 299 linhas)

- Drag-and-drop, valida tamanho (50MB) e linhas (500k). **Multi-drop corrigido** (pendingQueue)
- Pipeline: parse (main thread) → beginImport → insertSalesChunk (1000 linhas) → finalizeImport
- Progresso por arquivo (velocidade, ETA, barra)
- Wake Lock API (impede suspensão)
- Calendário de importações, tabela de histórico
- **Erros TS corrigidos** (ParsedSalesFile, onFilesSelected, FileEntry, sales order, imported dates)
- **Sem** Web Worker, cancelar, pausar/retomar, preview, validação de schema

### `/admin` — Gestão de Usuários (`src/routes/_authenticated/admin.tsx`)

- Lista de usuários, criar (com sufixo @gpabr.com), toggle ativo/admin, reset senha
- Seção Diagnose/Repair (contagem de registros, rebuild de agregações)
- Double-gated: `beforeLoad` + `<AdminGate>` + `assertAdmin` server-side
- **Sem** confirmação em ações destrutivas, loading inline no Switch, busca/filtro na lista, paginação, auditoria

---

## Server Functions

### `analytics.functions.ts` (10 funções)

- `getDashboard` faz **2 chamadas** ao banco (período atual + anterior) — poderia ser 1
- `getAreaAnalysis` com paginação/sorting/search server-side
- `getAreaFilterHierarchy` substitui 5 queries individuais
- Parsing defensivo via `asRecord`/`asArray`/`num()`/`str()` — belt-and-suspenders

### `admin.functions.ts` (7 funções)

- `assertAdmin` implementado inline (duplicado em `upload.functions.ts`)
- `repairAggregations`: itera datas individualmente — lento para muitos dias

### `upload.functions.ts` (3 funções)

- Pipeline trifásico com atomic swap via stored procedure `finalize_import`
- **`assertAdmin` idêntico ao de `admin.functions.ts`** — duplicado

---

## Componentes

| Componente        | Estado                                                                                       |
| ----------------- | -------------------------------------------------------------------------------------------- |
| `FilterBar`       | Funcional com cascata, seeds data range, re-clampa datas disponíveis                         |
| `DateRangePicker` | Presets + calendário, clamping a datas disponíveis                                           |
| `ImportCalendar`  | Heatmap mensal, cores hardcoded (quebra dark mode)                                           |
| `KpiCard`         | Delta badge com cores OKLCH hardcoded (quebra dark mode)                                     |
| `RankingCard`     | Skeleton, empty state — sem problemas, mas pai não passa `isLoading` corretamente no 1o load |
| `MultiSelect`     | Sem navegação por teclado, sem ARIA roles nos checkboxes customizados                        |
| `LastUpdateInfo`  | Busca **todas** as datas só pra achar a última; cores hardcoded no banner stale              |
| `AdminGate`       | Sem tratamento de erro de rede (cai em "deny" permanentemente)                               |

---

## Infraestrutura

- **Auth middleware**: `auth-middleware.ts` valida JWT local com `jsonwebtoken`
- **Segurança**: CSP completo (script-src nonce+strict-dynamic, style-src, frame-ancestors 'none'), X-Frame-Options, Turnstile CAPTCHA, rate limiting sliding window (4 tiers)
- **Error handling**: `safeError()` + `error-capture.ts` + `normalizeCatastrophicSsrResponse()`
- **CSS**: Tailwind v4 com OKLCH, `@theme inline`, `@utility kpi-card`. `.dark` block existe (completo) mas tema travado em light — toggle removido
- **Vite**: config com TanStack Start + Nitro. Preset `node-server` para VPS

---

## Banco de Dados

### MariaDB

- **Tabelas**: `products`, `stores`, `users`, `import_log`, `filter_hierarchy`, `sales_daily_agg`, `staging_sales`
- Queries diretas com mysql2 (sem stored procedures)
- Auth: JWT próprio com bcrypt + jsonwebtoken, cookie
