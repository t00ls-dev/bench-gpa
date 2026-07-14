# Bench GPA

## Sobre
Plataforma de analytics operacional/comercial para o Grupo Pão de Açúcar (GPA). Dashboard, análise de produtos, análise por área hierárquica, upload de planilhas XLSX e gerenciamento de usuários. UI em português brasileiro.

---

## Stack

| Camada | Tecnologia |
|---|---|
| Runtime | Bun |
| Framework | TanStack Start (React 19.2, SSR) |
| Roteamento | TanStack Router v1 (file-based, auto-generates `routeTree.gen.ts`) |
| Data Fetching | TanStack React Query v5 |
| Server Functions | `createServerFn` (RPC type-safe com Zod validation) |
| UI | shadcn/ui (New York style) + Radix UI primitives |
| Estilização | Tailwind CSS v4 (`@theme`, `@utility`, OKLCH colors) |
| Ícones | Lucide React |
| Charts | Recharts (BarChart, LineChart, ResponsiveContainer) |
| Forms | React Hook Form + Zod + @hookform/resolvers |
| Datas | date-fns v4, react-day-picker |
| Planilhas | xlsx (SheetJS) |
| PDF | jsPDF + jspdf-autotable |
| Auth/DB | Supabase (Auth, PostgreSQL, RPCs, RLS) |
| Lint | ESLint v9 + typescript-eslint |
| Build | Vite v7 + @vitejs/plugin-react |
| CSS | @tailwindcss/vite |
| Custom Vite | @lovable.dev/vite-tanstack-config |

---

## Pacotes Principais (package.json)
- `@tanstack/react-router`, `@tanstack/react-start`, `@tanstack/react-query`
- `@supabase/supabase-js`
- `@radix-ui/*` (20+ headless primitives)
- `zod`, `recharts`, `lucide-react`, `date-fns`, `sonner`, `nitro`

---

## Estrutura de Diretórios

```
├── src/
│   ├── components/
│   │   ├── ui/             → 30+ shadcn/ui primitives
│   │   ├── admin-gate.tsx           → Guard de permissão admin
│   │   ├── date-range-picker.tsx    → Seletor de período
│   │   ├── filter-bar.tsx           → Filtros cascata (loja > depto > secao > grupo > subgrupo)
│   │   ├── import-calendar.tsx      → Calendário de datas importadas
│   │   ├── kpi-card.tsx             → Card de KPI com variação e hint
│   │   ├── last-update-info.tsx     → Banner "última atualização"
│   │   ├── multi-select.tsx         → Dropdown com suporte a single/multi, search
│   │   └── ranking-card.tsx         → Tabela de ranking
│   │
│   ├── hooks/
│   │   ├── use-mobile.tsx
│   │   └── use-persistent-state.ts  → localStorage persist (prefixo bench-gpa:filters:*)
│   │
│   ├── integrations/supabase/
│   │   ├── client.ts            → Cliente anon key (lado cliente)
│   │   ├── client.server.ts     → Cliente service role (server-side, bypass RLS)
│   │   ├── auth-middleware.ts   → Valida Bearer token, injeta context.supabase + context.userId
│   │   ├── auth-attacher.ts     → Anexa token às serverFn
│   │   └── types.ts             → Tipos Database
│   │
│   ├── lib/
│   │   ├── admin.functions.ts     → Server functions: listUsers, createUser, setUserRole, etc.
│   │   ├── analytics.functions.ts → Server functions: dashboard, rankings, product/area analysis
│   │   ├── upload.functions.ts    → Server functions: beginImport, insertSalesChunk, finalizeImport
│   │   ├── xlsx-parser.ts         → Parser de XLSX no formato GPA (DTA_VENDA matrix)
│   │   ├── utils.ts               → cn(), fmtBRShort()
│   │   └── safe-error.ts          → Wrapper de erro seguro
│   │
│   ├── routes/
│   │   ├── __root.tsx             → HTML shell, SEO, tema, QueryClientProvider, Toaster
│   │   ├── auth.tsx               → Login email/senha
│   │   ├── _authenticated/
│   │   │   ├── route.tsx          → Layout + sidebar + beforeLoad auth check
│   │   │   ├── index.tsx          → Dashboard
│   │   │   ├── produto.tsx        → Análise de produto
│   │   │   ├── area.tsx           → Análise de área
│   │   │   ├── upload.tsx         → Upload XLSX (admin)
│   │   │   └── admin.tsx          → Gestão de usuários (admin)
│   │
│   ├── router.tsx
│   ├── routeTree.gen.ts           → Auto-gerado
│   ├── server.ts                  → Security headers, CSP
│   ├── start.ts                   → TanStack Start instance
│   └── styles.css                 → Tailwind v4 tokens, @utility kpi-card
│
├── scripts/
│   ├── import.ts                  → CLI: bun run cli:import <arquivo> [--user-id UUID]
│   ├── import-watch.ts            → Job cron: scan, normalize, import, log
│   ├── import-all.sh              → Lote: bash import-all.sh <dir>
│   └── extract-date.ts            → Utilitário: extrai data de filename ou conteúdo XLSX
│
├── logs/
│   ├── import.log                 → Log estruturado do import-watch (append)
│   └── cron.log                   → stdout/stderr da cron
│
├── docs/
│   ├── analise-pereciveis.md      → Estimativa: só perecíveis = 227 MB (vs 600 MB atual)
│   ├── migracao-sqlite.md         → Plano: Supabase Auth + SQLite
│   └── api-php-mariadb.md         → Plano: PHP Slim 4 + MariaDB (com apêndice Supabase Zero)
│
├── data/
│   └── YYYY-MM/                   → Planilhas .xlsx (import-watch escaneia mês corrente)
│
├── supabase/
│   ├── config.toml
│   └── migrations/                → 50+ migrations SQL
```

---

## Rotas

| Rota | Path | Auth | Descrição |
|---|---|---|---|
| Login | `/auth` | Não | Login email/senha |
| Dashboard | `/` | Sim | KPIs, evolução diária, top lojas, rankings, filtros cascata |
| Produto | `/produto` | Sim | Busca PLU, KPIs, evolução, tabela histórica com weekday-aware |
| Área | `/area` | Sim | Drill-down hierárquico, tabela sortável, PDF export |
| Upload | `/upload` | Admin | Drag-and-drop XLSX, chunk processing, calendário |
| Admin | `/admin` | Admin | CRUD de usuários, toggle ativo/admin, reset senha |

---

## Banco de Dados (PostgreSQL via Supabase)

### Tabelas Principais
| Tabela | Linhas | Função |
|---|---|---|
| `staging_sales` | 0 (limpa pós-import) | Staging temporário durante import |
| `sales_daily_agg` | ~393K | Agregado por hierarquia (dashboard) |
| `sales_prod_daily_agg` | ~1.37M | Agregado por produto (análise produto/área) |
| `products` | ~15,5K | Catálogo de produtos |
| `stores` | 18 | Lojas |
| `import_log` | 28 | Histórico de imports (4 por DOW, max 28 dias) |
| `filter_hierarchy` | ~22K | Hierarquia pré-computada para filtros cascata |
| `users` | — | Usuários (ref `auth.users`) |

### Tamanho (Jul/2026)
| Item | Tamanho |
|---|---|
| DB total | ~600 MB (acima do Free tier 500 MB) |
| `sales_prod_daily_agg` | 523 MB (237 dados + 287 índices) |
| `sales_daily_agg` | ~95 MB |

### RPCs
- `dashboard_metrics`, `dashboard_rankings`, `filter_options`
- `product_analysis`, `area_analysis`, `product_search`
- `imported_dates`, `has_role`, `upsert_products_bulk`, `finalize_import`

---

## Arquitetura e Fluxo de Dados

### Auth Flow
1. Cliente: `auth-attacher.ts` anexa `Authorization: Bearer <token>` a toda serverFn
2. Servidor: `auth-middleware.ts` valida token, fornece `context.supabase` + `context.userId`
3. Rotas: `beforeLoad` redireciona não autenticados para `/auth`; admin routes checam `has_role`

### Import Pipeline (Web UI)
Upload XLSX → `xlsx-parser.ts` parseia → `beginImport` deleta dados existentes + upsert products/stores → `insertSalesChunk` batches (1000 linhas) → `finalizeImport` popula `sales_daily_agg` e `sales_prod_daily_agg` direto de `staging_sales` + loga import + atualiza `filter_hierarchy` + `purge_old_aggs` (mantém 4 por DOW, max 28 dias)

### Import Watch (Cron)
Job automático via `crontab` executando `bun run cli:watch` a cada 1h (`0 * * * *`):

```
git pull --rebase --autostash
  → scan data/YYYY-MM/ (mês corrente)
  → para cada .xlsx:
       extrair data (do filename ou conteúdo)
       renomear/dedup para YYYY-MM-DD.xlsx
       checar import_log:
         - já importado → skip
         - fora dos 28 dias → skip
         - novo + dentro dos 28 dias → cli:import
       log em logs/import.log
  → commit + push APENAS se houve operação em arquivo
```

Paths: cron usa `/root/.bun/bin/bun` (PATH mínimo). Logs em `logs/import.log` e `logs/cron.log`.

### Analytics
Queries analíticas via Supabase RPCs, chamadas de server functions com React Query no cliente.

### Dois Clients Supabase
- `client.ts` (anon key) — queries autenticadas via middleware
- `client.server.ts` (service role) — operações admin, bypass RLS

### Retenção de Dados
- Máximo 28 dias corridos, exatamente 4 ocorrências por dia da semana
- `purge_old_aggs` roda após cada import (via RPC ou client-side no CLI)
- Import-watch verifica janela de 28 dias antes de importar

---

## Padrões e Convenções

### Código
- **Server Functions**: `createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator(z.parse).handler(...)`
- **Componentes**: named exports, TypeScript interfaces explícitas, sem default exports
- **Path alias**: `@/` → `src/`
- **Server-only**: `.server.ts` suffix evita bundle client-side
- **shadcn/ui**: class-variance-authority, `cn()` = clsx + tailwind-merge
- **PopoverContent**: usa `w-[var(--radix-popper-anchor-width)]` para largura dinâmica
  (em vez de `w-72` fixo), evitando overflow horizontal em grids estreitos

### Estilização
- Tailwind v4 com `@theme` inline tokens (OKLCH)
- `@utility` custom: `kpi-card`, `gradient-hero`, `gradient-primary`
- Fontes: Plus Jakarta Sans (display), Inter (body), JetBrains Mono (mono)

### State Management
- React Query para dados do servidor
- `useState` para estado local de UI
- `usePersistentState` para filtros (localStorage, prefixo `bench-gpa:filters:*`)

### Segurança
- **Erro seguro**: `safeError()` loga no servidor, retorna msg genérica ao cliente
- **CSP**: `frame-ancestors 'none'`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`
- **Admin não pode auto-dessativar**: não permite remover próprio role nem se desativar

### Decisões de Design
- **Filtros cascata**: ao mudar filtro pai, dependentes são limpos
- **Weekday-aware analytics**: produto compara contra mesmo dia da semana (janela 28 dias)
- **Chunked import**: 1000 linhas por chunk para evitar timeout
- **28-day purge**: mantém 4 ocorrências por dia da semana, apaga excedentes
- **Sem `sales`**: finalize_import popula agregados direto de `staging_sales`
- **Hints produto**: `"Últimos 4 domingos"` / `"Últimas 4 segundas-feiras"` / `"Últimos 28 dias"`

---

## Comandos Úteis

```bash
bun install                   # Instalar dependências
bun run dev                   # Rodar dev server
bun run build                 # Build de produção
bun run lint                  # ESLint
bun run cli:import <arquivo>  # Importar planilha manualmente
bun run cli:watch             # Executar job de import automático (scan+normalize+import+commit)
```

---

## Observações
- DB em ~600 MB, acima do Free tier (500 MB). `analise-pereciveis.md` estima economia de 373 MB mantendo só perecíveis
- Migração para PHP+MariaDB ou SQLite em planejamento (`docs/`)
- Cron ativo: `0 * * * *` com `/root/.bun/bin/bun run cli:watch`
- Arquivo `.env` contém `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`
- `bunfig.toml` tem guardrail de 24h para supply-chain
