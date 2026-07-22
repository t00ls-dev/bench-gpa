# Análise Completa

> Data: 22/07/2026 (manual, leitura completa do código + execução real de lint/typecheck/testes/coverage)

Esta análise **substitui** o snapshot de 21/07/2026 22:53, que estava desatualizado: a automação que o gerava (`code-review.yml` + `scripts/code-review.ts`) foi **removida no commit `e672ef1`** logo após o último snapshot, com a justificativa "CI + deploy já cobrem" — mas `ci.yml` não roda lint nem typecheck (ver achado #5). Resultado: o doc anterior afirmava "0 erros, 0 warnings" e ficou congelado; a run real de agora encontrou 219 problemas de lint. Os demais arquivos em `docs/improvements/` (`estado-atual.md`, `discrepancias.md`, `arquitetura.md`, `performance.md`, `novas-analises.md`) também estão defasados — ainda citam `analytics.functions.ts` (hoje dividido em `dashboard/area/product.functions.ts`), RPCs Supabase e `client.ts`, que não existem mais no código MariaDB atual. Recomendo tratá-los como histórico e não como referência viva até serem reescritos.

---

## 📊 Métricas Gerais (medidas agora)

| Métrica                          | Valor                                    |
| --------------------------------- | ----------------------------------------- |
| Arquivos .ts/.tsx (`src/`)        | 140                                       |
| Linhas de código (`src/`)         | 13.739                                    |
| Server functions (`createServerFn`) | 27 (5 arquivos `*.functions.ts` + `auth-api.ts`) |
| `requireRateLimit` aplicado       | ✅ 100% das funções lidas (24/24 nos 5 arquivos `*.functions.ts`) |
| Lint                               | ❌ 219 problemas (211 erros, 8 warnings) — 136 auto-corrigíveis (`--fix`) |
| Typecheck (`tsc --noEmit`)        | ✅ 0 erros |
| Testes (`vitest run`)             | ✅ 137 passando, 17 arquivos |
| Cobertura geral                    | 53.97% stmts / 45.22% branch / 40.57% funcs / 55.55% lines |
| Cobertura das server functions de negócio | 🔴 0% em `dashboard`, `area`, `product`, `upload`; ~23% em `admin` |
| Build                              | não executado nesta sessão (ambiente sem acesso à rede/DB) |
| Arquivos >300 linhas               | 7 |

---

## 🔒 Segurança

### 🔴 Crítico

**1. Sessão JWT não é `httpOnly` — token exposto a qualquer XSS**
`src/routes/auth.page.tsx:99`, `src/router.tsx:26`, `src/routes/_authenticated/route.tsx:109` gravam/limpam o cookie de sessão via `document.cookie` no client. O código server-side que monta um cookie `httpOnly` corretamente (`sessionCookie()`/`clearSession()` em `src/lib/auth-api.ts:13-29`) **nunca é usado** — `login()` retorna só a string do token (linha 77), `logout()` retorna `{cookie}` que ninguém aplica como header. É infraestrutura de segurança pronta e morta: na prática, o JWT fica 100% acessível via JavaScript. Qualquer XSS (ex.: um markdown mal sanitizado, uma dependência comprometida) rouba a sessão inteira, inclusive de admin.
**Ação**: mover a emissão do cookie para dentro do `handler` de `login`/`logout` usando a resposta HTTP real (o server function precisa setar o header `Set-Cookie`, não retornar o token para o client gravar).

**2. `console.log` vazando dados de sessão em produção**
`src/lib/auth-api.ts:83,87,96,102,107` (`getMe`) loga cookie header (100 chars), e-mails e erros de verificação de JWT — tudo indo para `logs/pm2-out.log` em produção.
**Ação**: remover ou trocar por logger com nível `debug` desligado em prod.

**3. Deploy não depende do resultado da CI**
`deploy.yml` dispara em `push: [main]` de forma totalmente independente de `ci.yml` (sem `needs`/`workflow_run`). `ci.yml`, por sua vez, só roda `test` + `build` — **não roda lint nem typecheck**. Um commit com testes quebrados mas que builda vai para produção sem barreira alguma.

**4. Rollback ausente no swap de deploy**
No step "Atomic swap + Restart PM2" (`deploy.yml`), os comandos não usam `set -e`; se `pm2 reload` falhar, os comandos seguintes rodam mesmo assim — incluindo o `rm -rf .../.output.old` no final, que apaga o build anterior bom. Não há health-check pós-deploy nem revert automático.

### 🟠 Alto

**5. `ecosystem.config.js` é duplicata morta e perigosa**
Coexiste com `ecosystem.config.cjs` (o real, que carrega `.env`). O `.js` tem `env` hardcoded **sem** `DB_HOST`/`DB_PASS`/`JWT_SECRET`/Turnstile. Se alguém rodar `pm2 start ecosystem.config.js` por engano (nome quase idêntico), o processo sobe sem autenticação funcional (`auth-middleware.ts:15` derruba tudo por falta de `JWT_SECRET`). `scripts/deploy.sh` também referencia esse arquivo errado e descreve um fluxo (`git pull` + build no servidor) que **não é** o que `deploy.yml` realmente faz hoje (build no runner + rsync do `.output`) — script obsoleto e enganoso.
**Ação**: apagar `ecosystem.config.js` e `scripts/deploy.sh`, ou atualizar `scripts/deploy.sh` para refletir o pipeline real.

**6. Lint real diverge fortemente do que os docs afirmavam**
219 problemas, sendo ~75 erros `@typescript-eslint/no-explicit-any` (violam a própria regra do `AGENTS.md`: *"TypeScript: strict mode, sem `any`"*), alguns usos de `Function` (tipo genérico demais), 1 bug real (`src/lib/utils.test.ts:10` — `no-constant-binary-expression`, uma condição que sempre avalia igual, provavelmente um teste que não testa o que deveria), 2 warnings de `react-hooks/exhaustive-deps` (`area.page.tsx:89,206` — dependências de `useMemo` incompletas, risco de estado desatualizado). 136 dos 219 são só formatação Prettier (auto-fixáveis).

**7. Retenção de dados: doc e código dizem coisas diferentes por confundir dois conceitos**
`README.md`/`AGENTS.md` dizem "retenção de 28 dias corridos". Na real, `purgeOldAggs` (`admin.functions.ts:144-150`) chama `purge_old_aggs(180)` — a retenção de agregados é **180 dias**. Os "28 dias" são a **janela do import automático** (`scripts/import-watch.ts:153-156`, só importa arquivo se `daysAgo <= 28`) — um conceito diferente. Corrigir a documentação para não confundir os dois.

### 🟡 Médio

- **Cache de admin não invalida na revogação**: `admin-utils.ts:4-17` cacheia `assertAdmin` por 5 min. Um usuário rebaixado via `setUserRole` continua com privilégio de admin em cache por até 5 min.
- **Cache de leitura não invalida pós-escrita**: `getFilterOptions`/`getAreaFilterHierarchy` (TTL 5 min) e `getImportedDates` (TTL 1 min) continuam servindo dados stale por até 5 min após um upload novo ser finalizado — mesmo o banco já tendo `refresh_filter_hierarchy()` atualizado.
- **Rate limiter detecta rota de upload por heurística de payload** (`rate-limit.middleware.ts:9-13`, checa `"rows" in data`), não pela rota real. Qualquer server function futura com um campo chamado `rows` cai silenciosamente no tier mais permissivo (Upload, 200/min) em vez do tier API.
- **`JWT_EXPIRY` do `.env` nunca é lido** — `auth-api.ts:75` hardcoda `expiresIn: "7d"`. Mudar a env var no `.env` não tem efeito nenhum — configuração morta e enganosa.
- **Sem revogação de sessão**: JWT de 7 dias sem refresh nem blacklist — logout só limpa o cookie local; um token copiado continua válido até expirar.
- **Correções de permissão do VPS existem só como commits vazios** (`b1e58f3`, `7c03965` — mensagens documentando ações manuais tipo `usermod`/`chmod` feitas direto no servidor). Não estão em `docs/migracao-vps-autossuficiente.md` nem em script idempotente — se o VPS for reconstruído, essa configuração se perde silenciosamente.
- **Dois scripts de crontab contraditórios**: `setup-crons.sh` (purge 03h, review 05h, watch 07h+19h) vs `setup-crontab.sh` (watch a cada hora, review 06h). `README.md` bate com `setup-crontab.sh`, mas não fica claro qual é o autoritativo hoje.

### ✅ Bem implementado (confirmado por leitura direta)

- Todas as queries usam parâmetros (`?`) — **sem risco de SQL injection** em nenhum dos `*.functions.ts` ou `scripts/import.ts`.
- `assertAdmin` **já centralizado** em `admin-utils.ts` — a duplicação citada nos docs antigos não existe mais.
- Turnstile fail-closed correto (`turnstile.ts:36-42`).
- CSP forte: nonce + `strict-dynamic`, `frame-ancestors 'none'`, `X-Frame-Options: DENY`.
- bcrypt cost factor 12.
- PM2 roda em `exec_mode: "fork", instances: 1` (não cluster) — o rate-limiter e o cache in-memory não têm bug de estado dividido entre processos.
- `sanitizeNext()` bloqueia open redirect corretamente.
- `finalize_import` é transacional (`START TRANSACTION`/`ROLLBACK`/`RESIGNAL`, `scripts/migrate-schema.sql:750-825`) — swap atômico real entre staging e agregações.
- Secrets do deploy (`SSH_PRIVATE_KEY`, `VPS_HOST` etc.) nunca aparecem em `echo`/logs do workflow; swap via `mv` (não substitui arquivos in-place).

---

## 🧪 Testes e Qualidade

- **137 testes passando**, 17 arquivos — bem além do "zero testes" que um doc antigo afirmava. Cobrem bem: `rate-limit.ts` (94%), `admin-utils.ts` (100%), `auth-api.ts` (85%), `use-hotkey.ts` (94%), `xlsx-parser.ts` (78%).
- 🔴 **Lógica de negócio principal sem nenhum teste**: `dashboard.functions.ts`, `area.functions.ts`, `product.functions.ts`, `upload.functions.ts` estão em **0% de cobertura** (confirmado via `coverage/lcov.info`, não só o resumo). `admin.functions.ts` está em ~23%. É exatamente o código que processa dinheiro/vendas e o pipeline de import — o que mais precisaria de rede de segurança para refactors.
- 🟡 `vitest.config.ts` só inclui `src/**/*.test.ts` — **nenhum componente React (`.tsx`) é testável neste setup**, mesmo com `@testing-library/react` instalado. Zero cobertura de rotas/componentes por configuração, não por falta de esforço.
- 🟢 `xlsx-parser.ts` é a lógica mais frágil do pipeline (depende do layout exato da planilha) e tem cobertura parcial (78%) — vale fechar os 22% restantes antes de mexer nele.

---

## ⚡ Performance

- 🟢 `getDashboard` já faz as 2 chamadas (período atual + anterior) em `Promise.all` — **não é sequencial** como um doc antigo dizia. Unificar em 1 query ainda é uma otimização válida, mas de impacto baixo (já paralelo).
- 🟡 `diagnoseData` (`admin.functions.ts:120-126`) itera 6 tabelas com `await` sequencial em vez de `Promise.all` — baixo impacto (rota admin, uso raro).
- 🟢 Sem N+1 real nas rotas de leitura — dashboard/área/produto usam stored procedures de chamada única; paginação server-side onde necessário.
- 🟢 7 arquivos >300 linhas: `sidebar.tsx` (744, componente shadcn, não é código próprio), `area.page.tsx` (487, o maior arquivo próprio do repo), `produto.page.tsx` (368), `upload.page.tsx` (365), `index.page.tsx` (337), `chart.tsx` (320, shadcn), `area-table.tsx` (308, tamanho razoável para uma tabela virtualizada). Nenhum é crítico, mas `area.page.tsx` é candidato natural a decomposição.
- 🟡 **Duplicação estrutural entre as 3 páginas de analytics** (dashboard/produto/área): cada uma reimplementa parsing de filtros de URL/localStorage e export PDF via `jspdf`+`jspdf-autotable` com imports dinâmicos quase idênticos, sem hook/util compartilhado — já divergiram (só Área usa `placeholderData: (prev) => prev`, as outras têm flash de loading ao trocar filtro).
- 🟢 `insertSalesChunk` (`upload.functions.ts`) sem `.max()` no array `rows` do schema Zod — tamanho do chunk depende só do cliente; mitigado por rate limit (30/min) mas não impede um chunk anormalmente grande numa única chamada.

---

## 🎨 UX/UI

- 🟡 **Dark mode: mais pronto do que os docs antigos sugeriam, mas ainda não plugado**. Não é "toggle removido" — existe um `ThemeToggle` completo e funcional (`src/components/theme-toggle.tsx`, usa `useSyncExternalStore`, aplica `.dark` na raiz), mas **não é importado em lugar nenhum**. É só colocar `<ThemeToggle />` no header/sidebar (`route.tsx`). A alegação de cores OKLCH hardcoded em `kpi-card.tsx`/`import-calendar.tsx` **não se confirma** no código atual.
- 🟡 **PDF de Área com colunas sempre vazias** (`area.page.tsx:314-323`): header inclui "QTD" e "VALIDADE", mas o body sempre gera string vazia para essas colunas — esse dado não existe na fonte. Ocupa espaço à toa no PDF.
- 🟡 **Dashboard descarta dado que já calculou**: `data.previous.byDate` é retornado pelo backend mas nunca renderizado (`index.page.tsx`) — só `data.previous.total` é usado no KPI. Funcionalidade pronta no backend, falta só o gráfico comparativo no frontend.
- ✅ **Já corrigido** (contrariando docs antigos): `filteredHierarchy` duplicado em `area.page.tsx` — não existe mais. Admin sem confirmação em ações destrutivas — `admin-user-management.tsx:184-230` já tem `AlertDialog`. Upload sem cancelar — já tem `cancelRef` + botão + toast. `MultiSelect` sem teclado/ARIA — já tem `role`, `aria-selected/expanded/haspopup`, navegação por teclado. `AdminGate` sem tratamento de erro de rede — já tem estado `"error"` dedicado (falta só um botão de retry).

---

## 🏗️ Dívida Técnica (priorizada)

1. 🔴 Cookie de sessão não-httpOnly (ver Segurança #1) — a dívida técnica mais séria do projeto.
2. 🟠 `ecosystem.config.js` + `scripts/deploy.sh` obsoletos e potencialmente destrutivos se executados por engano.
3. 🟡 Zero cobertura de teste nas 4 server functions de negócio mais importantes.
4. 🟡 ~75 usos de `any` contrariando a regra própria do `AGENTS.md`.
5. 🟡 Cache sem invalidação ativa pós-escrita (admin role, upload, purge) — só expira por TTL.
6. 🟢 Duplicação de parsing/export entre as 3 páginas de analytics.
7. 🟢 Dois scripts de crontab e dois `ecosystem.config.*` — confusão operacional por arquivos concorrentes não removidos.
8. 🟢 `docs/improvements/*.md` (exceto este arquivo) desatualizados desde a migração Supabase→MariaDB.

---

## ⚡ Quick Wins

| # | Ação | Tempo | Prioridade |
|---|---|---|---|
| 1 | Emitir o cookie de sessão via header `Set-Cookie` httpOnly no server, parar de usar `document.cookie` | 30 min | 🔴 |
| 2 | Remover os `console.log` de `auth-api.ts:83-107` | 5 min | 🔴 |
| 3 | Apagar `ecosystem.config.js` e `scripts/deploy.sh` (obsoletos/perigosos) | 5 min | 🟠 |
| 4 | Adicionar `bun run lint && bun run typecheck` ao `ci.yml` | 10 min | 🟠 |
| 5 | Adicionar `needs: ci` (ou equivalente) em `deploy.yml` para não deployar se a CI falhar | 10 min | 🟠 |
| 6 | `bun run lint --fix` (resolve 136 dos 219 problemas automaticamente) | 5 min | 🟡 |
| 7 | Adicionar `<ThemeToggle />` no header — dark mode já está pronto | 10 min | 🟢 |
| 8 | Corrigir README/AGENTS.md: retenção é 180 dias, não 28 (28 é a janela do import automático) | 5 min | 🟡 |
| 9 | Remover colunas "QTD"/"VALIDADE" do PDF de Área (sempre vazias) | 10 min | 🟢 |
| 10 | Consolidar `setup-crons.sh`/`setup-crontab.sh` em um só script | 15 min | 🟡 |

---

## 📋 Recomendações por Prioridade

### 🔴 Crítica (agir imediatamente)

1. Corrigir o fluxo de cookie de sessão para `httpOnly` real (Segurança #1)
2. Remover logs de dados de sessão em produção (Segurança #2)
3. Gatear deploy pelo resultado da CI + adicionar lint/typecheck à CI (Segurança #3)
4. Adicionar `set -e`/health-check ao step de swap do deploy, para não apagar o backup bom em caso de falha (Segurança #4)

### 🟠 Alta (próxima sprint)

5. Remover `ecosystem.config.js` e `scripts/deploy.sh` obsoletos
6. Rodar `lint --fix` + resolver os ~75 `any` restantes manualmente
7. Escrever testes para `dashboard/area/product/upload.functions.ts` (0% de cobertura hoje)
8. Corrigir doc de retenção (180 dias, não 28)

### 🟡 Média (próximas semanas)

9. Invalidar cache ativamente após upload/mudança de role (não só TTL)
10. Corrigir detecção de rota no rate-limit middleware (por rota real, não heurística de payload)
11. Ler `JWT_EXPIRY` de fato, ou remover a env var enganosa
12. Consolidar os dois scripts de crontab
13. Extrair hook/util compartilhado de parsing de filtros + export PDF entre dashboard/produto/área
14. Documentar as correções manuais de permissão do VPS em `docs/migracao-vps-autossuficiente.md` (idempotência se o VPS for reconstruído)

### 🟢 Baixa (melhorias contínuas)

15. Plugar `<ThemeToggle />` (dark mode já pronto)
16. Remover colunas vazias do PDF de Área; renderizar `data.previous.byDate` no Dashboard
17. Reescrever `estado-atual.md`, `discrepancias.md`, `arquitetura.md`, `performance.md`, `novas-analises.md` (referenciam código Supabase-era que não existe mais)
18. Paralelizar `diagnoseData` (6 queries sequenciais → `Promise.all`)
19. Adicionar `.max()` no schema Zod de `insertSalesChunk`

---

## Observações

Análise gerada manualmente em 22/07/2026, via leitura completa do código-fonte + execução real de `lint`/`typecheck`/`test`/`coverage` (não apenas inspeção estática). Achados de segurança e infraestrutura foram verificados de forma independente (grep direto + leitura de arquivo), não apenas reportados por uma única fonte.
