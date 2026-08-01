# Bench GPA

Plataforma de analytics operacional/comercial para o Grupo Pão de Açúcar (GPA). Dashboard, análise de produtos, análise por área hierárquica, upload de planilhas XLSX e gerenciamento de usuários.

## Stack

| Camada             | Tecnologia                                                                   |
| ------------------ | ---------------------------------------------------------------------------- |
| Runtime            | Bun                                                                          |
| Framework          | TanStack Start (React 19, SSR)                                               |
| Roteamento         | TanStack Router v1 (file-based)                                              |
| Data Fetching      | TanStack React Query v5 + Server Functions                                   |
| UI                 | shadcn/ui (New York) + Radix UI + Tailwind CSS v4                            |
| Charts             | Recharts                                                                     |
| Planilhas          | SheetJS (xlsx)                                                               |
| PDF                | jsPDF + jspdf-autotable                                                      |
| Virtualização      | @tanstack/react-virtual                                                      |
| Drawer (mobile)    | vaul                                                                         |
| Paleta de comandos | cmdk                                                                         |
| Auth/DB            | MariaDB + JWT próprio (bcrypt + jsonwebtoken)                                |
| CAPTCHA            | Cloudflare Turnstile (non-interactive, fail-closed)                          |
| Segurança          | CSP nonce, HSTS, rate limiting sliding window (4 tiers por IP + 1 por conta) |

## Pré-requisitos

- [Bun](https://bun.sh) >= 1.2
- Arquivo `.env` (copie `.env.example` e preencha) com credenciais MariaDB + Turnstile + JWT

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

| Rota      | Path       | Auth  | Descrição                                               |
| --------- | ---------- | ----- | ------------------------------------------------------- |
| Login     | `/auth`    | Não   | Login email/senha + Turnstile CAPTCHA                   |
| Dashboard | `/`        | Sim   | KPIs, evolução diária, top lojas, rankings, PDF export  |
| Produto   | `/produto` | Sim   | Análise de produto com weekday-aware, PDF export        |
| Área      | `/area`    | Sim   | Drill-down hierárquico, tabela virtualizada, PDF export |
| Upload    | `/upload`  | Admin | Upload de planilhas XLSX                                |
| Admin     | `/admin`   | Admin | Gestão de usuários                                      |
| Como usar | `/howto`   | Sim   | Guia do sistema, atalhos, exportação                    |

## Importação de Dados

As planilhas **não são versionadas**: `data/` está no `.gitignore`. São dados
operacionais do GPA e o repositório não é meio de transporte deles. Há dois
caminhos para importar:

### Pela aplicação (uso normal)

Tela `/upload`, restrita a admin: aceita vários arquivos de uma vez e lê a data
de dentro da planilha (marcador `DTA_VENDA`), então o nome do arquivo não
importa. Importa na hora, sem esperar o cron.

### Pelo servidor (lotes, sob demanda)

Copie os arquivos para `data/` no servidor (`scp`/`rsync`, em qualquer subpasta)
e rode:

```bash
bun run cli:import data/2026-07-13.xlsx   # um arquivo específico
bun run cli:watch                          # varre o inbox inteiro
```

`cli:watch` percorre `data/` e subpastas, identifica a data pelo nome ou pelo
conteúdo, importa o que ainda não está na `import_log` e está dentro do horizonte
de 180 dias (cap atrelado ao purge) e **apaga a planilha depois de importar**. A
fonte de verdade passa a ser o banco, que tem dump diário para o Backblaze.
Arquivo que falhou fica no inbox para nova tentativa; data já importada é
mantida e apenas sinalizada no log.

**A importação não roda em cron.** O agendamento do `cli:watch` foi desligado em
26/07/2026: ele existia para reagir às planilhas que chegavam pelo git, e sem
isso a importação passou a ser um ato deliberado: pela tela ou por estes
comandos. As crons ativas são a purga e a atualização de produtos/filtros:

```
0 3 * * *    bun run cli:purge >> logs/purge.log 2>&1                        # limpa agregados antigos (03h)
30 3 * * *   bun run cli:refresh-universe >> logs/refresh-universe.log 2>&1  # produtos + hierarquia de filtros (03h30, após a purga)
```

Instalada via `bash scripts/setup-crons.sh` (fonte da verdade das crons).

## Arquitetura

- **Auth**: JWT próprio (bcrypt + jsonwebtoken) + Turnstile CAPTCHA (fail-closed). Rate limiting: 10/min IP (tier Auth) + 5/15min por conta (e-mail).
- **Rate limiting**: Sliding window in-memory por IP + global. 4 tiers por IP: SSR (300/min), API (300/min), Upload (200/min), Auth (10/min), mais um balde independente por conta no login (5/15min por e-mail), contra credential stuffing distribuído por vários IPs.
- **Cache**: SimpleCache com TTL + dedup in-flight. Dashboard e rankings (60s), hierarquia área e opções de filtro (5min), datas importadas (60s), role (5min/user).
- **PWA**: `manifest.json` + ícones (favicon, apple-touch-icon, maskable) versionados com o hash do commit, cache-busting automático a cada deploy, independente do cache do Cloudflare. Instalável em mobile; não funciona offline (dados vêm sempre do servidor).
- **Segurança**: CSP nonce (script-src nonce+strict-dynamic), HSTS, Turnstile, rate limit em todas as server functions autenticadas (`requireRateLimit`, hoje 27 usos em 8 arquivos `*.functions.ts`).
- **Auditoria & monitoramento**: `audit_log` registra ações sensíveis (login ok/falho, logout, criação/alteração de usuário, reset de senha, purga); IP resolvido atrás do Cloudflare (`CF-Connecting-IP`). `cron_heartbeat` grava a última execução de cada cron (`purge`, `refresh-universe`) com status e duração, sinalizando atrasos. Ambos visíveis em `/admin` → aba **Auditoria**.
- **Import**: XLSX → parse → staging → `sales_daily_agg` + `sales_prod_daily_agg` (chunks de 1000 linhas). Import automático varre o mês corrente com cap de 180 dias.
- **Retenção**: agregados purgados após 180 dias (`purge_old_aggs`, cron diário 03h). O import automático usa o **mesmo** horizonte de 180 dias (`RETENTION_DAYS`) para não reimportar o que o purge apagaria: evita o loop importar→purgar→reimportar.
- **Filtros cascata**: Loja → Departamento → Seção → Grupo → Subgrupo. Dependentes são limpos ao mudar o pai.
- **UX**: Atalhos de teclado (g+letra), command palette (Cmd+K), help overlay (Shift+/), bottom tab bar mobile, View Transitions API, exportação PDF (Dashboard, Produto, Área).
- **Deploy**: CI GitHub Actions (`.github/workflows/ci.yml`) → rsync do `.output` para a VPS Hestia (`sv1.t00ls.dev`, `gpa.t00ls.dev`) → swap atômico + restart PM2 com rollback automático. Não há PaaS. Docs em `docs/`.
  - A integração legada com o **Vercel** foi removida em 2026-07-23 (projeto desconectado e os environments `Production`/`Preview` do GitHub apagados): a aba **Deployments** do GitHub não é mais usada.

## Estrutura

```
├── src/
│   ├── components/   → Componentes React
│   ├── hooks/        → Hooks customizados
│   ├── lib/          → Server functions, schemas Zod, cache, CSP, rate limit, Turnstile, auth/sessão, PDF export
│   └── routes/       → Rotas TanStack Router (lazy loaded)
├── scripts/          → CLI de import (manual e automático)
├── data/             → Inbox local de planilhas XLSX (não versionado)
└── docs/             → Documentação técnica e planos de migração
```

## Licença

Uso interno GPA.
