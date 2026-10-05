# Bench GPA

> **Projeto descontinuado e hibernado em 05/10/2026.** A aplicação foi retirada
> de produção, as automações foram desligadas e o banco operacional foi excluído
> sem criar um novo backup. Este repositório permanece apenas como preservação
> do código-fonte e do histórico Git. Consulte
> [`docs/hibernacao-2026-10-05.md`](docs/hibernacao-2026-10-05.md).

Plataforma de analytics operacional/comercial para o Grupo Pão de Açúcar (GPA). Dashboard, análise de produtos, análise por área hierárquica, previsão de venda, upload de planilhas XLSX e gerenciamento de usuários.

## Stack

| Camada          | Tecnologia                                                                   |
| --------------- | ---------------------------------------------------------------------------- |
| Runtime         | Bun                                                                          |
| Framework       | TanStack Start (React 19, SSR)                                               |
| Roteamento      | TanStack Router v1 (file-based)                                              |
| Data Fetching   | TanStack React Query v5 + Server Functions                                   |
| UI              | shadcn/ui (New York) + Radix UI + Tailwind CSS v4                            |
| Charts          | Recharts                                                                     |
| Planilhas       | SheetJS (xlsx)                                                               |
| PDF             | jsPDF + jspdf-autotable                                                      |
| Virtualização   | @tanstack/react-virtual                                                      |
| Drawer (mobile) | vaul                                                                         |
| Auth/DB         | MariaDB + JWT próprio (bcrypt + jsonwebtoken)                                |
| CAPTCHA         | Cloudflare Turnstile (non-interactive, fail-closed)                          |
| Segurança       | CSP nonce, HSTS, rate limiting em janela fixa (7 tiers por IP + 1 por conta) |

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

O `prebuild` executa `scripts/generate-doc-meta.ts`. Ele percorre `docs/**/*.md`
e atualiza `src/generated/doc-meta.json` somente quando os caminhos ou os
timestamps de alteração real do conteúdo Git mudam. Alterações apenas de modo
ou renomes sem mudança do conteúdo não avançam o timestamp. O arquivo é
importado no bundle e fornece a data exibida em `/admin/docs` apenas quando o
próprio Markdown não contém uma data. A geração depende do histórico Git
completo e não deve ser substituída por horário do filesystem.

## Lint

```bash
bun run lint
```

## Publicação

O desenvolvimento e a publicação são fluxos separados. Commits e pushes,
inclusive na `main`, executam as validações, mas não alteram a produção.

| Evento                        | Validações | Artefato e sourcemaps | Deploy |
| ----------------------------- | ---------- | --------------------- | ------ |
| Pull request                  | Sim        | Não                   | Não    |
| Push ou merge na `main`       | Sim        | Não                   | Não    |
| `workflow_dispatch` na `main` | Sim        | Sim                   | Sim    |

### Antes de publicar

Confirme que:

- todas as alterações desejadas foram integradas na `main`;
- o CI mais recente da `main` passou;
- não há mudanças locais pendentes.

```bash
git switch main
git pull --ff-only
git status --short
```

`git status --short` não deve produzir saída nesse exemplo.

### Iniciar o deploy

Pela interface, abra **Actions > CI/CD > Run workflow** e selecione `main`.
Pela linha de comando:

```bash
gh workflow run ci.yml --ref main
```

Execuções manuais em outras branches são rejeitadas. Tags e GitHub Releases
podem ser usadas para registrar versões, mas não iniciam o workflow nem o deploy.

### Acompanhar o deploy

Pela interface, abra **Actions > CI/CD**. Pela linha de comando:

```bash
gh run list --workflow "CI/CD" --limit 5
gh run watch <run-id> --exit-status
```

Uma publicação executa nesta ordem:

1. Audit de dependências, lint, type-check, testes e build.
2. Schema-check em uma instância MariaDB descartável.
3. Upload do artefato e dos sourcemaps para o Sentry.
4. Envio da aplicação e migrations para a VPS.
5. Aplicação das migrations antes da troca da versão ativa.
6. Criação de uma release versionada e troca atômica do symlink `current`.
7. Reload do PM2 e health-check HTTP.

Se uma validação, upload ou migration falhar antes da troca do symlink, a
versão em produção permanece ativa. Se o health-check falhar após a troca, o
workflow restaura automaticamente a release anterior. As cinco releases mais
recentes permanecem na VPS.

Após o sucesso, abra `https://gpa.t00ls.dev` e confira no rodapé se o hash do
commit corresponde ao commit publicado.

### Hotfix

Hotfix não usa um pipeline diferente:

1. Faça a correção em uma branch curta.
2. Abra a pull request e aguarde CI e schema-check.
3. Integre a correção na `main`.
4. Confirme o CI da `main`.
5. Inicie manualmente o workflow `CI/CD` na `main`.

### Falhas operacionais

Se o upload falhar por falta de quota de artefatos, produção não é alterada.
Depois que o GitHub recalcular a quota, execute novamente o run que falhou:

```bash
gh run rerun <run-id>
```

Tags podem registrar versões, mas não publicam em produção. Somente o dispatch
manual do workflow `CI/CD` na `main` representa intenção de publicar.

## Rotas

| Rota              | Path               | Auth  | Descrição                                                              |
| ----------------- | ------------------ | ----- | ---------------------------------------------------------------------- |
| Login             | `/auth`            | Não   | Login usuário ou matrícula + senha, Turnstile CAPTCHA                  |
| Primeiro acesso   | `/first-access`    | Não   | Define a senha inicial (usuário ou matrícula), auto-login              |
| Trocar senha      | `/change-password` | Sim   | Troca voluntária ou forçada (senha expirada há 30+ dias)               |
| Dashboard         | `/`                | Sim   | KPIs, evolução diária, top lojas e rankings                            |
| Produto           | `/product`         | Sim   | Análise de produto por período, dia da semana e filtros persistidos    |
| Área              | `/area`            | Sim   | Drill-down, evolução diária, média semanal, tabela e PDF export        |
| Previsão de Venda | `/forecast`        | Sim   | Venda esperada por produto de Perecíveis numa loja/dia, com PDF export |
| Upload            | `/upload`          | Admin | Upload de planilhas XLSX                                               |
| Admin             | `/admin`           | Admin | Gestão de usuários                                                     |
| Documentação      | `/admin/docs`      | Admin | Documentação interna                                                   |
| Como usar         | `/howto`           | Sim   | Guia do sistema, filtros e exportação                                  |

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
bun run cli:import data/2026-07-13.xlsx --replace  # substitui uma data já importada
bun run cli:watch                          # varre o inbox inteiro
```

O `cli:import` recusa datas existentes por padrão. A substituição exige
`--replace`; pela aplicação, exige confirmação explícita na lista de arquivos.

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

Em ambientes standalone, as crons são instaladas via
`bash scripts/setup-crons.sh`. Em produção, a fonte da verdade é o cron do
HestiaCP (`/usr/local/hestia/data/users/admin/cron.conf`); o script não deve ser
executado na VPS de produção.

## Arquitetura

- **Auth**: JWT próprio (bcrypt + jsonwebtoken), login por username ou matrícula, + Turnstile CAPTCHA (fail-closed). Rate limiting: 10/min IP (tier Auth) + 10/15min por conta (chave = id resolvido, não a string digitada).
- **Rate limiting**: Janela fixa em memória por IP + global, iniciada na primeira requisição de cada chave. 7 tiers por IP: SSR (300/min), entrada de server functions (300/min), API (300/min), Upload (250/min), Auth (10/min), PDF (10/min) e monitoramento (60/min), mais um balde independente por conta no login (10/15min, chaveado pelo id do usuário resolvido), contra credential stuffing distribuído por vários IPs. Respostas bloqueadas usam HTTP `429` e `Retry-After`.
- **Cache**: SimpleCache com TTL + dedup in-flight. Dashboard e rankings (60s), hierarquia área e opções de filtro (5min), datas importadas (60s), veredito de administrador (5min/usuário).
- **PWA**: `manifest.json` + ícones (favicon, apple-touch-icon, maskable) versionados com o hash do commit, cache-busting automático a cada deploy, independente do cache do Cloudflare. Instalável em mobile; não funciona offline (dados vêm sempre do servidor).
- **Segurança**: CSP nonce (script-src nonce+strict-dynamic), HSTS, Turnstile e rate limit nas server functions autenticadas via `requireRateLimit`.
- **Auditoria & monitoramento**: `audit_log` registra ações sensíveis (login ok/falho, logout, primeiro acesso ok/falho, troca de senha própria, criação/alteração de usuário, reset de senha por admin, atualização de identificadores, purga); IP resolvido atrás do Cloudflare (`CF-Connecting-IP`). `cron_heartbeat` grava a última execução de cada cron (`purge`, `refresh-universe`) com status e duração, sinalizando atrasos. Ambos visíveis em `/admin` → aba **Auditoria**.
- **Import**: XLSX → parse → staging → `sales_daily_agg` + `sales_prod_daily_agg` (chunks de 1000 linhas). Sem cron: pela tela `/upload` ou por `cli:import`/`cli:watch`, sob demanda (ver seção "Importação de Dados" acima).
- **Retenção**: agregados purgados após 180 dias (`purge_old_aggs`, cron diário 03h). `cli:watch` usa o **mesmo** horizonte de 180 dias (`RETENTION_DAYS`) para não reimportar o que o purge apagaria: evita o loop importar→purgar→reimportar.
- **Filtros cascata**: Loja → Departamento → Seção → Grupo → Subgrupo → Produto na Área; Seção → Grupo → Subgrupo → Produto na Previsão. Dependentes são limpos ao mudar o pai. Alterar somente a data da Previsão preserva os filtros selecionados.
- **Hierarquia comercial**: `product_universe` é a fonte da classificação atual. Vendas históricas são atribuídas ao Departamento, Seção, Grupo e Subgrupo atuais do produto, não à classificação registrada no dia da venda.
- **UX**: Bottom tab bar mobile, View Transitions API e exportação PDF (Área e Previsão de Venda).
- **Áreas salvas**: composição persistente com um proprietário, leitura compartilhável entre usuários autenticados por URL/QR Code, mesmos gráficos da Área, transferência de propriedade somente por admin e histórico local por usuário com até 10 visitas por 30 dias.
- **Deploy**: somente um `workflow_dispatch` manual na `main` inicia a publicação pelo GitHub Actions (`.github/workflows/ci.yml`). O workflow envia `.output` por rsync para a VPS Hestia (`sv1.t00ls.dev`, `gpa.t00ls.dev`), cria uma release em `releases/<timestamp>-<sha-curto>/`, troca o symlink `current` atomicamente e recarrega o PM2 (`fork`/1 instância, VPS tem 1 núcleo só). O health-check reverte automaticamente em caso de falha. As cinco releases mais recentes são mantidas. Pushes comuns e tags não publicam nem armazenam artefatos. Não há PaaS. Docs em `docs/`.
  - A integração legada com o **Vercel** foi removida em 2026-07-23 (projeto desconectado e os environments `Production`/`Preview` do GitHub apagados): a aba **Deployments** do GitHub não é mais usada.

## Estrutura

```
├── src/
│   ├── components/   → Componentes React
│   ├── hooks/        → Hooks customizados
│   ├── lib/          → Server functions, schemas Zod, cache, CSP, rate limit, Turnstile, auth/sessão, PDF export
│   └── routes/       → Rotas TanStack Router (lazy loaded)
├── scripts/          → CLI de import (execução manual, sob demanda)
├── data/             → Inbox local de planilhas XLSX (não versionado)
└── docs/             → Documentação técnica e planos de migração
```

## Licença

Uso interno GPA.
