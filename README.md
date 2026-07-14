# Bench GPA

Plataforma de analytics operacional/comercial para o Grupo Pão de Açúcar (GPA). Dashboard, análise de produtos, análise por área hierárquica, upload de planilhas XLSX e gerenciamento de usuários.

## Stack

| Camada | Tecnologia |
|---|---|
| Runtime | Bun |
| Framework | TanStack Start (React 19, SSR) |
| Roteamento | TanStack Router v1 (file-based) |
| Data Fetching | TanStack React Query v5 + Server Functions |
| UI | shadcn/ui (New York) + Radix UI + Tailwind CSS v4 |
| Charts | Recharts |
| Formulários | React Hook Form + Zod |
| Planilhas | SheetJS (xlsx) |
| PDF | jsPDF + jspdf-autotable |
| Auth/DB | Supabase (Auth, PostgreSQL, RPCs, RLS) |

## Pré-requisitos

- [Bun](https://bun.sh) >= 1.2
- Projeto Supabase com as migrations em `supabase/migrations/`
- Arquivo `.env` com `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`

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
| Login | `/auth` | Não | Login email/senha |
| Dashboard | `/` | Sim | KPIs, evolução diária, top lojas, rankings |
| Produto | `/produto` | Sim | Análise de produto com weekday-aware |
| Área | `/area` | Sim | Drill-down hierárquico, PDF export |
| Upload | `/upload` | Admin | Upload de planilhas XLSX |
| Admin | `/admin` | Admin | Gestão de usuários |

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

- **Auth**: Supabase Auth com login email/senha. Token JWT anexado automaticamente às server functions via middleware.
- **Import**: XLSX → parse → staging → `sales_daily_agg` + `sales_prod_daily_agg` (chunks de 1000 linhas).
- **Retenção**: 28 dias corridos, exatamente 4 ocorrências por dia da semana. Purga automática pós-import.
- **Filtros cascata**: Loja → Departamento → Seção → Grupo → Subgrupo. Dependentes são limpos ao mudar o pai.

## Estrutura

```
├── src/
│   ├── components/   → Componentes React
│   ├── hooks/        → Hooks customizados
│   ├── integrations/ → Clientes Supabase + auth middleware
│   ├── lib/          → Server functions, parsers, utilitários
│   └── routes/       → Rotas TanStack Router
├── scripts/          → CLI de import (manual e automático)
├── supabase/         → Config + migrations SQL
├── logs/             → Logs do import-watch
├── data/             → Planilhas XLSX organizadas por mês
└── docs/             → Documentação técnica e planos de migração
```

## Licença

Uso interno GPA.
