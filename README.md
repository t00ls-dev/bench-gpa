# Bench GPA

Plataforma de analytics operacional/comercial para o Grupo Pão de Açúcar (GPA). Dashboard, análise de produtos, análise por área hierárquica, upload de planilhas XLSX e gerenciamento de usuários.

## Stack

| Camada | Tecnologia |
|---|---|---|
| Runtime | Bun |
| Framework | TanStack Start (React 19, SSR) |
| Roteamento | TanStack Router v1 (file-based) |
| Data Fetching | TanStack React Query v5 + Server Functions |
| UI | shadcn/ui (New York) + Radix UI + Tailwind CSS v4 |
| Charts | Recharts |
| Planilhas | SheetJS (xlsx) |
| PDF | jsPDF + jspdf-autotable |
| Virtualização | @tanstack/react-virtual |
| Drawer (mobile) | vaul |
| Paleta de comandos | cmdk |
| Auth/DB | Supabase (Auth, PostgreSQL, RPCs, RLS) — migrando para MariaDB + JWT próprio |
| CAPTCHA | Cloudflare Turnstile (non-interactive, fail-closed) |
| Segurança | CSP nonce, rate limiting sliding window (4 tiers) |

## Pré-requisitos

- [Bun](https://bun.sh) >= 1.2
- Projeto Supabase com as migrations em `supabase/migrations/`
- Arquivo `.env` (copie `.env.example` e preencha) com credenciais Supabase + Turnstile

## Instalação

```bash
bun install
```

## Desenvolvimento

```bash
bun run dev
```

## Build

```bash
bun run build
```

## Lint

```bash
bun run lint
```

## Rotas

| Rota | Path | Auth | Descrição |
|---|---|---|---|
| Login | `/auth` | Não | Login email/senha + Turnstile CAPTCHA |
| Dashboard | `/` | Sim | KPIs, evolução diária, top lojas, rankings, PDF export |
| Produto | `/produto` | Sim | Análise de produto com weekday-aware, PDF export |
| Área | `/area` | Sim | Drill-down hierárquico, tabela virtualizada, PDF export |
| Upload | `/upload` | Admin | Upload de planilhas XLSX |
| Admin | `/admin` | Admin | Gestão de usuários |
| Como usar | `/howto` | Sim | Guia do sistema, atalhos, exportação |

## Importação de Dados

### Manual

```bash
bun run cli:import data/2026-07/2026-07-13.xlsx
```

### Automática (cron)

Job executa a cada 1h via crontab:

```
0 * * * * /root/.bun/bin/bun run cli:watch >> logs/cron.log 2>&1
```

Escaneia `data/YYYY-MM/`, normaliza nomes, importa planilhas novas dentro da janela de 28 dias, e commita automaticamente.

## Arquitetura

- **Auth**: Supabase Auth + Turnstile CAPTCHA (fail-closed). Rate limiting: 5/min IP (tier Auth).
- **Rate limiting**: Sliding window in-memory por IP + global. 4 tiers: SSR (120/min), API (120/min), Upload (30/min), Auth (5/min).
- **Cache**: SimpleCache com TTL + dedup in-flight. Dashboard (30s), hierarquia área (5min), datas importadas (1min), role (5min/user).
- **Segurança**: CSP nonce (script-src nonce+strict-dynamic), Turnstile, rate limit em todas as 20 server functions (`requireRateLimit`).
- **Import**: XLSX → parse → staging → `sales_daily_agg` + `sales_prod_daily_agg` (chunks de 1000 linhas).
- **Retenção**: 28 dias corridos, exatamente 4 ocorrências por dia da semana. Purga automática pós-import.
- **Filtros cascata**: Loja → Departamento → Seção → Grupo → Subgrupo. Dependentes são limpos ao mudar o pai.
- **UX**: Atalhos de teclado (g+letra), command palette (Cmd+K), help overlay (Shift+/), bottom tab bar mobile, View Transitions API, exportação PDF (Dashboard, Produto, Área).
- **Migração planejada**: Deploy no VPS Hestia (`sv1.t00ls.dev`, `gpa.t00ls.dev`) com MariaDB + JWT próprio. Docs em `docs/`.

## Estrutura

```
├── src/
│   ├── components/   → Componentes React
│   ├── hooks/        → Hooks customizados
│   ├── integrations/ → Clientes Supabase + auth middleware (a remover na migração)
│   ├── lib/          → Server functions, schemas Zod, cache, CSP, rate limit, Turnstile, PDF export
│   └── routes/       → Rotas TanStack Router (lazy loaded)
├── scripts/          → CLI de import (manual e automático)
├── supabase/         → Config + migrations SQL
├── data/             → Planilhas XLSX organizadas por mês
└── docs/             → Documentação técnica e planos de migração
```

## Licença

Uso interno GPA.
