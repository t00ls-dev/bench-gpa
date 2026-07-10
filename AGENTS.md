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
src/
├── components/
│   ├── ui/             → 30+ shadcn/ui primitives (button, dialog, select, skeleton, switch, slider, etc.)
│   ├── admin-gate.tsx           → Guard de permissão admin (component-level)
│   ├── date-range-picker.tsx    → Seletor de período
│   ├── filter-bar.tsx           → Filtros cascata (loja > depto > secao > grupo > subgrupo)
│   ├── import-calendar.tsx      → Calendário de datas importadas
│   ├── kpi-card.tsx             → Card de KPI com indicador de variação
│   ├── last-update-info.tsx     → Banner "última atualização"
│   ├── multi-select.tsx         → Multi-select dropdown
│   └── ranking-card.tsx         → Tabela de ranking
│
├── hooks/
│   ├── use-mobile.tsx           → Detecção de mobile breakpoint
│   └── use-persistent-state.ts  → useState com persistência em localStorage (chave: bench-gpa:filters:*)
│
├── integrations/supabase/
│   ├── client.ts            → Cliente Supabase (anon key, lado cliente)
│   ├── client.server.ts     → Cliente Supabase (service role key, server-side, bypass RLS)
│   ├── auth-middleware.ts   → Middleware TanStack Start: valida Bearer token, injeta context.supabase + context.userId
│   ├── auth-attacher.ts     → Middleware cliente: anexa token às chamadas serverFn
│   └── types.ts             → Tipos gerados do banco (Database interface)
│
├── lib/
│   ├── admin.functions.ts     → Server functions: listUsers, createUser, setUserRole, setUserActive, resetPassword
│   ├── analytics.functions.ts → Server functions: dashboard, rankings, product search/analysis, area analysis, filter options
│   ├── upload.functions.ts    → Server functions: beginImport, insertSalesChunk, finalizeImport
│   ├── xlsx-parser.ts         → Parser de XLSX no formato GPA
│   ├── utils.ts               → cn(), fmtBRShort()
│   ├── safe-error.ts          → Wrapper de erro: loga detalhes no servidor, retorna msg genérica
│   ├── error-capture.ts       → Captura global de erros/rejeições SSR
│   └── config.server.ts       → Helper de config server-side
│
├── routes/
│   ├── __root.tsx             → Raiz: HTML shell, SEO, tema, QueryClientProvider, Toaster
│   ├── auth.tsx               → Login (email/senha com Supabase)
│   ├── _authenticated/
│   │   ├── route.tsx          → Layout autenticado: beforeLoad auth check, sidebar/nav, user profile
│   │   ├── index.tsx          → Dashboard (home)
│   │   ├── produto.tsx        → Análise de produto
│   │   ├── area.tsx           → Análise de área
│   │   ├── upload.tsx         → Upload XLSX (admin only)
│   │   └── admin.tsx          → Gestão de usuários (admin only)
│
├── router.tsx                 → Criação do router com QueryClient
├── routeTree.gen.ts           → Árvore de rotas auto-gerada
├── server.ts                  → SSR server: security headers, error normalization, clickjacking protection
├── start.ts                   → TanStack Start instance: function middleware (auth) + request middleware (error handling)
└── styles.css                 → Tailwind v4 tokens, design tokens OKLCH, kpi-card utility, temas

supabase/
├── config.toml                → Config do projeto Supabase
└── migrations/                → 24 migrations SQL (schema, RPCs, RLS)
```

---

## Rotas

| Rota | Path | Auth | Descrição |
|---|---|---|---|
| Login | `/auth` | Não | Login email/senha |
| Dashboard | `/` | Sim | KPIs, evolução diária, top lojas, rankings por hierarquia, filtros cascata com comparação de período |
| Produto | `/produto` | Sim | Busca por PLU/nome, KPIs, comparação por loja, evolução, tabela histórica |
| Área | `/area` | Sim | Drill-down hierárquico, tabela sortável, PDF export |
| Upload | `/upload` | Admin | Drag-and-drop XLSX, chunk processing, calendário |
| Admin | `/admin` | Admin | CRUD de usuários, toggle ativo/admin, reset senha |

---

## Banco de Dados (PostgreSQL via Supabase)

### Tabelas Principais
- `public.sales` — Fato: `id, sale_date, store_code, store_name, depto, secao, grupo, subgrupo, prod_code, prod_name, val_vda`
- `public.products` — `prod_code PK, prod_name, last_seen` (índice trigram para busca)
- `public.stores` — `store_code PK, store_name`
- `public.users` — `id PK (ref auth.users), email, name, role (admin|user), is_active, created_at`
- `public.import_log` — `sale_date PK, row_count, imported_at, imported_by`
- `public.filter_hierarchy` — Hierarquia pré-computada para filtros cascata
- `public.sales_daily_agg` — Materialized view para dashboard rápido

### RPCs
- `dashboard_metrics`, `dashboard_rankings`, `filter_options`
- `product_analysis`, `area_analysis`, `product_search`
- `imported_dates`, `has_role`

---

## Arquitetura e Fluxo de Dados

### Auth Flow
1. Cliente: `auth-attacher.ts` anexa `Authorization: Bearer <token>` a toda serverFn
2. Servidor: `auth-middleware.ts` valida o token, fornece `context.supabase` + `context.userId`
3. Rotas: `beforeLoad` redireciona não autenticados para `/auth`; admin routes checam role via RPC `has_role`

### Import Pipeline
Upload XLSX → `xlsx-parser.ts` parseia → `beginImport` deleta dados existentes + upsert products/stores → `insertSalesChunk` batches (100-2000 linhas configurável) → `finalizeImport` loga import + atualiza materialized views

### Analytics
Todas as queries analíticas via Supabase RPCs chamadas de server functions com React Query no cliente.

### Dois Clients Supabase
- `client.ts` (anon key) — para queries autenticadas via middleware
- `client.server.ts` (service role) — para operações admin, bypass RLS (importado dinamicamente dentro dos handlers)

---

## Padrões e Convenções

### Código
- **Server Functions**: `createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator(z.parse).handler(...)`
- **Componentes**: named exports, TypeScript interfaces explícitas no topo, sem default exports
- **Path alias**: `@/` → `src/`
- **Server-only**: `.server.ts` suffix evita bundle client-side
- **Comentários**: em português (quando existem)
- **shadcn/ui**: class-variance-authority para variantes, `cn()` = clsx + tailwind-merge

### Estilização
- Tailwind v4 com `@theme` inline tokens (espaço de cor OKLCH)
- `@utility` custom: `kpi-card`, `gradient-hero`, `gradient-primary`
- Fontes: Plus Jakarta Sans (display), Inter (body), JetBrains Mono (mono)

### State Management
- React Query para dados do servidor
- `useState` para estado local de UI (modais, busca, paginação)
- `usePersistentState` para preferências de filtro (localStorage, prefixo `bench-gpa:filters:*`)

### Segurança
- **Erro seguro**: `safeError()` loga o erro real server-side, retorna mensagem genérica ao cliente
- **CSP**: `frame-ancestors 'none'`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`
- **Admin não pode auto-dessativar**: um admin não pode remover próprio role admin nem se desativar
- **Senhas**: sem email infrastructure (refatorado de magic link para email/senha)

### Decisões de Design
- **Cascading filter reset**: ao mudar filtro pai, dependentes são limpos
- **Product filtering client-side**: área analysis busca tudo e filtra/ordena/pagina no cliente
- **Weekday-aware analytics**: produto compara contra mesmo dia da semana histórico
- **Chunked import**: 100-2000 linhas por chunk para evitar timeout
- **Sem email**: login simplificado email/senha, sem magic links

---

## Comandos Úteis

```bash
bun install           # Instalar dependências
bun run dev           # Rodar dev server
bun run build         # Build de produção
bun run lint          # ESLint
```

---

## Observações
- Projeto gerado/modificado via Lovable.dev (template `tanstack_start_ts`)
- Arquivo `.env` contém `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`
- `bunfig.toml` tem guardrail de 24h para supply-chain
