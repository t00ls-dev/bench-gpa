# Análise Completa

> Data: 22/07/2026 (manual, leitura completa do código + execução real de lint/typecheck/testes/coverage)
> Atualizado na mesma data após uma rodada de correções: ver seção "Resolvido" abaixo para o que mudou desde a versão anterior deste documento.
>
> **Métricas re-medidas em 30/07/2026** (tabela abaixo). Entre 22/07 e 30/07 rodou
> uma auditoria **separada** desta (relatório de performance/segurança/UX ad-hoc,
> não este arquivo), com 13 PRs mergeados (#14 a #26): correções rápidas de
> segurança/performance, atualização de `seroval`/`xlsx` por vulnerabilidade,
> lazy-loading, conversão de logos para WebP, remoção de 21 dependências e 27
> componentes shadcn mortos, indicador de progresso no export de PDF, divisão de
> `admin.functions.ts` em módulos, extração de `FilterField` compartilhado,
> remoção de uma contagem duplicada em `area_analysis`, e as quatro partes de
> centralização de constantes ("números mágicos"). Nenhum item da lista de
> **Recomendações** deste documento foi tocado nessa rodada. São pendências
> independentes. Estado corrente e o que ainda está aberto: `docs/continuar.md`.

Esta análise **substitui** o snapshot de 21/07/2026 22:53, que estava desatualizado: a automação que o gerava (`code-review.yml` + `scripts/code-review.ts`) foi **removida no commit `e672ef1`**, com a justificativa "CI + deploy já cobrem", mas isso ficou obsoleto assim que o CI passou a rodar lint/typecheck (ver histórico de resolução abaixo). Os demais arquivos em `docs/improvements/` (`estado-atual.md`, `discrepancias.md`, `arquitetura.md`, `novas-analises.md`, `melhorias-pendentes.md`) ainda citam `analytics.functions.ts` (hoje dividido em `dashboard/area/product.functions.ts`), RPCs Supabase e `client.ts`, que não existem mais no código MariaDB atual. **Desde 26/07/2026 cada um traz um aviso no topo**. Antes o alerta só existia aqui e no README, e quem abrisse o arquivo direto (pelo `/admin/docs`, por exemplo) não via nada. O `performance.md` foi apagado em vez de marcado: era o mais convidativo para quem fosse atacar performance e o mais errado, hoje substituído por `docs/medicao-performance.md`.

---

## Métricas Gerais (medidas agora)

> Métricas re-medidas em 30/07/2026. A queda de arquivos/linhas em relação à
> medição de 26/07 é sobretudo a remoção de 27 componentes shadcn e 5
> dependências npm mortos (PR #19), não perda de funcionalidade.

| Métrica                          | Valor                                    |
| --------------------------------- | ----------------------------------------- |
| Arquivos .ts/.tsx (`src/`)        | 115                                       |
| Linhas de código (`src/`)         | 12.008                                    |
| Server functions (`createServerFn`) | 39                                      |
| `requireRateLimit` aplicado       | 100% das funções lidas, tier explícito por rota (`"api"`/`"upload"`) |
| Lint                               | 0 erros, 3 warnings (ruído de fast-refresh do shadcn/ui) |
| Typecheck (`tsc --noEmit`)        | 0 erros |
| Testes (`vitest run`)             | 214 passando, 22 arquivos |
| Cobertura geral                    | 55,6% lines (ver `docs/coverage-summary.md`, gerado via `bun run coverage:summary`) |
| Cobertura das server functions de negócio | [Médio] `area` 66,7%, `admin-users` 74,3% (herdou o teste do antigo `admin.functions.ts`), `dashboard` 26,8%; `admin-docs`, `admin-system`, `product` e `upload` em 0% |
| Arquivos >300 linhas               | 6 (`sidebar.tsx` 744, shadcn, não é código próprio; `area.page.tsx` 507; `upload.page.tsx` 375; `produto.page.tsx` 370; `index.page.tsx` 341; `area-table.tsx` 322) |

---

## Resolvido

Itens que estavam listados como problema em versões anteriores desta análise e já foram corrigidos, mantidos aqui como registro, não como pendência.

| Item | Como foi resolvido |
|---|---|
| [Crítico] Cookie de sessão não-httpOnly | `login()`/`logout()` usam `setCookie()`/`deleteCookie()` do `@tanstack/react-start/server` com `httpOnly: true`; client não toca mais em `document.cookie` (commit `dcfc19f`) |
| [Crítico] `console.log` vazando dados de sessão | Removidos de `auth-api.ts` (commit `dcfc19f`) |
| [Crítico] Deploy não depende do resultado da CI | `deploy.yml` tem `needs: ci` (commit `ff3b38e`) |
| [Crítico] Rollback ausente no swap de deploy | `set -euo pipefail` + função `rollback()` + health-check via `curl` pós-restart (commit `ff3b38e`) |
| [Alto] `ecosystem.config.js` + `scripts/deploy.sh` obsoletos e perigosos | Ambos apagados: só resta `ecosystem.config.cjs` (o real, carrega `.env`) |
| [Alto] 219 problemas de lint / ~75 usos de `any` | `eslint .` real agora: 0 erros, 8 warnings conhecidos (commits `b52be53`, `bc47622`) |
| [Alto] Retenção documentada errado (28 vs 180 dias) | README corrigido: retenção real é 180 dias (`purge_old_aggs(180)`); 28 dias é a janela do import automático, conceito separado |
| [Médio] Rate limiter detectava upload por heurística de payload | `requireRateLimit` agora é uma factory (`requireRateLimit("api" \| "upload")`) chamada explicitamente por rota em cada `*.functions.ts`, não mais inferindo pelo formato do payload |
| [Médio] `JWT_EXPIRY` do `.env` nunca era lido | `auth-api.ts` lê `Number(process.env.JWT_EXPIRY)` (com fallback de 7d) e usa o mesmo valor no `expiresIn` do JWT e no `maxAge` do cookie. Antes eram duas constantes hardcoded coincidentemente iguais |
| [Baixo] Dois scripts de crontab contraditórios | `scripts/setup-crontab.sh` (obsoleto, órfão) apagado; `scripts/setup-crons.sh` é o único e reflete o crontab real |
| [Baixo] Cron de `cli:review` (05h/06h) | Script nunca existiu (`cli:review` ausente de `package.json`). Cron falhava todo dia silenciosamente. Removido de `setup-crons.sh` e do crontab ativo |
| [Baixo] Dark mode pronto mas não plugado | `<ThemeToggle />` adicionado ao header (`route.tsx`). **Bônus**: achou e corrigiu um bug real no processo: `useSyncExternalStore` sem `getServerSnapshot` quebrava a renderização SSR assim que o componente era usado de verdade (nunca tinha sido testado em produção) |
| [Alto] Toggle de tema não persistia entre reloads | A classe `dark` só era aplicada dentro do handler de clique, nunca no mount. `useEffect` agora sincroniza a classe com o tema resolvido a cada mudança (incluindo no carregamento da página) |
| [Alto] `purge_old_aggs` deixava metade do trabalho para trás | Não apagava `products` (que não era purgada por nada: ~10,2k linhas/dia sem teto, alimentando `product_search` com PLUs cujas vendas já tinham sumido) nem chamava `refresh_filter_hierarchy`. Descoberto ao purgar à mão as datas anteriores a 27/05, quando foi preciso fazer as duas coisas fora da proc (commit `37c2ba8`) |
| [Alto] Atomicidade ilusória no `finalize_import` | Os refreshes usavam `TRUNCATE`, que é DDL: faz commit implícito (a transação terminava ali, o `EXIT HANDLER` deixava de desfazer e o `COMMIT` virava no-op) e não respeita MVCC. **Medido**: durante os ~33s do refresh um leitor concorrente via ZERO linha na `product_universe`. A tela Área ficava vazia a cada import, em horário comercial. Trocado por `DELETE`, que custa +11% e resolve os dois (commit `37c2ba8`) |
| [Crítico] Reset de senha não derrubava as sessões abertas | JWT stateless de 7 dias sem revogação: redefinir a senha de uma conta comprometida não expulsava ninguém. `users.token_version` selada no token e conferida em `requireAuth`/`getMe`; `resetPassword` incrementa. Transição sem deslogar ninguém via `payload.tokenVersion ?? 0` (commit `1b923d6`) |
| [Médio] `requireAuth` lia o `role` do banco e o descartava | Usava `payload.role` do JWT, congelado na emissão: um usuário rebaixado seguiria `admin` no contexto por até 7 dias. Inofensivo só porque `assertAdmin` refazia a consulta, mas era armadilha para o próximo uso (commit `1b923d6`) |
| [Alto] Telas mais caras sem cache nenhum | `getAreaAnalysis` (2,1s na janela padrão, 23,0s em 28 dias) e `getDashboardRankings` eram as duas únicas server functions de análise sem cache: o `dashboard_metrics` já era cacheado pelo `callMetrics`. Export de PDF fica de fora do cache de propósito (commit `1fdfa53`). **Números atualizados em 26/07** com o protocolo de `docs/medicao-performance.md`: `dashboard_metrics` e `dashboard_rankings` passaram a varrer o agregado uma vez só (46,3s→10,1s e 32,4s→19,0s em 28 dias); a mesma mudança em `area_analysis` regrediu e foi revertida |
| [Baixo] Metadados de SEO/social num app interno | `og:*`, `twitter:*` e `description` removidos do `__root.tsx`; indexação é anti-feature aqui. `public/robots.txt` mantido (`Disallow: /`): bloqueia, não habilita (PR #1) |
| [Alto] Planilhas versionadas / git como meio de transporte de dados | Os XLSX chegavam pela interface do GitHub e o `import-watch` fazia `pull`→`mv`→`commit`→`push`. 41 MiB de pack e, pior, o push automático quebraria em silêncio sob qualquer regra de proteção de branch. `data/` virou inbox local ignorado; o cron foi desligado e a importação passou a ser deliberada (PR #2) |
| [Baixo] `KNOWN_JOBS` com "Purga (180 dias)" escrito à mão | No mesmo arquivo que já importa `RETENTION_DAYS` e o usa corretamente duas linhas antes. Mudaria a retenção e o painel passaria a mentir. Agora interpola a constante (PR #1) |
| [Alto] Data de "Atualizado" sempre igual no histórico de importações | `str()` (helper genérico) trunca `Date` para `YYYY-MM-DD`: correto para `sale_date` (coluna `DATE`), errado para `imported_at`/`created_at` (colunas `TIMESTAMP`, têm hora). Como o mysql2 retorna `TIMESTAMP` como objeto `Date`, a hora era descartada antes de chegar no frontend. Afetava 3 lugares: `getImportedDates` (upload.functions.ts), `getLatestSaleInfo` (dashboard.functions.ts), e `listUsers` (admin.functions.ts, via cast `as {...}` que também mentia sobre `is_active` ser `boolean` quando na real é `0`/`1`). Corrigido com um novo helper `dateTimeStr()` (preserva o ISO completo) usado nos três; `sale_date` continua com `str()`, que é o comportamento certo pra ele. Auditoria completa: nenhum outro campo `DATE`/`TIMESTAMP`/`DECIMAL` do schema tem o mesmo problema (verificado contra dados reais do banco). |

---

## Segurança

### Crítico

Nenhum item aberto no momento: os 4 achados anteriores (cookie httpOnly, log de sessão, deploy sem gate de CI, rollback ausente) foram todos corrigidos. Ver "Resolvido" acima.

### Alto

Nenhum item aberto no momento.

### Médio

- ~~**Cache de admin não invalida na revogação**~~ Resolvido (verificado 30/07/2026): `invalidateAdminCache(userId)` existe em `admin-utils.ts` e é chamado por `setUserRole`/`setUserActive` em `admin-users.functions.ts`. Um usuário rebaixado perde o privilégio cacheado na hora, não em até 5 min.
- **Cache de leitura não invalida pós-escrita**: `getFilterOptions`/`getAreaFilterHierarchy` (TTL 5 min) e `getImportedDates` (TTL 1 min) continuam servindo dados stale por até 5 min após um upload novo ser finalizado, mesmo o banco já tendo `refresh_filter_hierarchy()` atualizado.
- ~~**Sem revogação de sessão**~~ [Médio] Parcial (verificado 30/07/2026): `users.token_version` é selado no JWT e conferido em `requireAuth`/`getMe` a cada request (`auth-middleware.ts`); `resetPassword` incrementa, derrubando sessões antigas na hora. Não é blacklist geral nem refresh token: só revoga no reset de senha, não em um "logout everywhere" sob demanda.
- **Correções de permissão do VPS existem só como commits vazios** (`b1e58f3`, `7c03965`, mensagens documentando ações manuais tipo `usermod`/`chmod` feitas direto no servidor). Não estão em `docs/migracao-vps-autossuficiente.md` nem em script idempotente: se o VPS for reconstruído, essa configuração se perde silenciosamente.

### Bem implementado (confirmado por leitura direta)

- Todas as queries usam parâmetros (`?`): **sem risco de SQL injection** em nenhum dos `*.functions.ts` ou `scripts/import.ts`.
- `assertAdmin` **já centralizado** em `admin-utils.ts`: a duplicação citada nos docs antigos não existe mais.
- Turnstile fail-closed correto (`turnstile.ts:36-42`).
- CSP forte: nonce + `strict-dynamic`, `frame-ancestors 'none'`, `X-Frame-Options: DENY`.
- bcrypt cost factor 12.
- PM2 roda em `exec_mode: "fork", instances: 1` (não cluster): o rate-limiter e o cache in-memory não têm bug de estado dividido entre processos.
- `sanitizeNext()` bloqueia open redirect corretamente.
- `finalize_import` é transacional (`START TRANSACTION`/`ROLLBACK`/`RESIGNAL`, `scripts/migrate-schema.sql:750-825`): swap atômico real entre staging e agregações.
- Secrets do deploy (`SSH_PRIVATE_KEY`, `VPS_HOST` etc.) nunca aparecem em `echo`/logs do workflow; swap via `mv` (não substitui arquivos in-place).

---

## Testes e Qualidade

- **138 testes passando**, 17 arquivos. Cobrem bem: `rate-limit.ts` (94%), `admin-utils.ts` (100%), `auth-api.ts` (85%), `use-hotkey.ts` (94%), `xlsx-parser.ts` (78%).
- [Crítico] **Lógica de negócio principal sem nenhum teste**: `dashboard.functions.ts`, `area.functions.ts`, `product.functions.ts`, `upload.functions.ts` estão em **0% de cobertura** (confirmado via `coverage/lcov.info`, não só o resumo). `admin.functions.ts` está em ~23%. É exatamente o código que processa dinheiro/vendas e o pipeline de import, o que mais precisaria de rede de segurança para refactors.
- [Médio] `vitest.config.ts` só inclui `src/**/*.test.ts`: **nenhum componente React (`.tsx`) é testável neste setup**, mesmo com `@testing-library/react` instalado. Zero cobertura de rotas/componentes por configuração, não por falta de esforço.
- [Baixo] `xlsx-parser.ts` é a lógica mais frágil do pipeline (depende do layout exato da planilha) e tem cobertura parcial (78%), vale fechar os 22% restantes antes de mexer nele.
- [Novo] `bun run coverage:summary` gera `docs/coverage-summary.md` com tabela por arquivo: usar isso para acompanhar progresso em vez de rodar `coverage` manualmente.

---

## Performance

- [Baixo] `getDashboard` já faz as 2 chamadas (período atual + anterior) em `Promise.all`: **não é sequencial** como um doc antigo dizia. Unificar em 1 query ainda é uma otimização válida, mas de impacto baixo (já paralelo).
- [Médio] `diagnoseData` (`admin.functions.ts:120-126`) itera 6 tabelas com `await` sequencial em vez de `Promise.all`: baixo impacto (rota admin, uso raro).
- [Baixo] Sem N+1 real nas rotas de leitura: dashboard/área/produto usam stored procedures de chamada única; paginação server-side onde necessário.
- [Baixo] 7 arquivos >300 linhas: `sidebar.tsx` (744, componente shadcn, não é código próprio), `area.page.tsx` (487, o maior arquivo próprio do repo), `produto.page.tsx` (368), `upload.page.tsx` (365), `index.page.tsx` (337), `chart.tsx` (320, shadcn), `area-table.tsx` (308, tamanho razoável para uma tabela virtualizada). Nenhum é crítico, mas `area.page.tsx` é candidato natural a decomposição.
- [Médio] **Duplicação estrutural entre as 3 páginas de analytics** (dashboard/produto/área): cada uma reimplementa parsing de filtros de URL/localStorage e export PDF via `jspdf`+`jspdf-autotable` com imports dinâmicos quase idênticos, sem hook/util compartilhado. Já divergiram (só Área usa `placeholderData: (prev) => prev`, as outras têm flash de loading ao trocar filtro).
- [Baixo] `insertSalesChunk` (`upload.functions.ts`) sem `.max()` no array `rows` do schema Zod: tamanho do chunk depende só do cliente; mitigado por rate limit (tier upload, 200/min) mas não impede um chunk anormalmente grande numa única chamada.

---

## UX/UI

- **Corrigido nesta sessão**: dark mode, `<ThemeToggle />` plugado no header (`route.tsx`), e o bug de SSR (`useSyncExternalStore` sem `getServerSnapshot`) que quebrava a página ao usar o componente foi corrigido junto.
- [Médio] **PDF de Área com colunas "QTD"/"VALIDADE" sempre vazias** (`area.page.tsx`): o código (`didParseCell`) **limpa deliberadamente** o texto dessas duas colunas no PDF. Isso parece um formulário impresso para preenchimento manual (conferência física de estoque/validade), não um bug. **Não removido nesta sessão**: precisa de confirmação de produto antes de decidir entre (a) manter como formulário intencional, (b) remover se for lixo mesmo, ou (c) documentar a intenção no código com um comentário.
- [Médio] **Dashboard descarta dado que já calculou**: `data.previous.byDate` é retornado pelo backend mas nunca renderizado (`index.page.tsx`). Só `data.previous.total` é usado no KPI. Funcionalidade pronta no backend, falta só o gráfico comparativo no frontend.
- **Já corrigido** (contrariando docs antigos): `filteredHierarchy` duplicado em `area.page.tsx`: não existe mais. Admin sem confirmação em ações destrutivas: `admin-user-management.tsx:184-230` já tem `AlertDialog`. Upload sem cancelar: já tem `cancelRef` + botão + toast. `MultiSelect` sem teclado/ARIA: já tem `role`, `aria-selected/expanded/haspopup`, navegação por teclado. `AdminGate` sem tratamento de erro de rede: já tem estado `"error"` dedicado (falta só um botão de retry).

---

## Dívida Técnica (priorizada)

1. [Médio] Zero cobertura de teste nas 4 server functions de negócio mais importantes.
2. [Médio] Cache de leitura (`getFilterOptions`, `getAreaFilterHierarchy`, `getImportedDates`) sem invalidação ativa pós-upload. Só expira por TTL. (Cache de admin role já invalida ativamente, ver "Médio" acima.)
3. [Baixo] Duplicação de parsing/export entre as 3 páginas de analytics.
4. ~~[Baixo] `docs/improvements/*.md` (exceto este arquivo) desatualizados~~ Resolvido em 30/07/2026: ver `docs/historia-do-projeto.md` e `docs/continuar.md` §8.
5. [Baixo] Revogação de sessão parcial (token_version só no reset de senha, sem "logout everywhere" sob demanda nem refresh token).
6. [Baixo] Correções de permissão do VPS não documentadas de forma idempotente.
7. [Baixo] Casts `as {...}` sem passar por `asRecord`/conversão em `product.functions.ts:27,38` e `auth-api.ts:70,104`: campos são só `VARCHAR`/booleanos checados por truthy (`!user.is_active`), então não quebram em runtime, mas é o mesmo padrão frágil que causou o bug do `imported_at`. Vale padronizar por consistência, não por bug ativo.

---

## Quick Wins

| # | Ação | Status |
|---|---|---|
| 1 | Emitir o cookie de sessão via header `Set-Cookie` httpOnly no server | Feito |
| 2 | Remover os `console.log` de sessão | Feito |
| 3 | Apagar `ecosystem.config.js` e `scripts/deploy.sh` | Feito |
| 4 | Adicionar `bun run lint && bun run typecheck` ao `ci.yml` | Feito |
| 5 | Adicionar `needs: ci` em `deploy.yml` | Feito |
| 6 | Resolver os problemas de lint (não só auto-fix) | Feito (0 erros) |
| 7 | Adicionar `<ThemeToggle />` no header | Feito |
| 8 | Corrigir README/AGENTS.md: retenção é 180 dias, não 28 | Feito |
| 9 | Remover colunas "QTD"/"VALIDADE" do PDF de Área | Pausado: parece intencional (ver UX/UI acima), precisa decisão de produto |

---

## Recomendações por Prioridade

### Média (próximas semanas)

1. Invalidar cache ativamente após upload/mudança de role (não só TTL)
2. Escrever testes para `dashboard/area/product/upload.functions.ts` (0% de cobertura hoje)
3. Documentar as correções manuais de permissão do VPS em `docs/migracao-vps-autossuficiente.md` (idempotência se o VPS for reconstruído)

### Baixa (melhorias contínuas)

4. Decidir sobre as colunas QTD/VALIDADE do PDF de Área (manter como formulário intencional ou remover)
5. Renderizar `data.previous.byDate` no Dashboard (gráfico comparativo)
6. Extrair hook/util compartilhado de parsing de filtros + export PDF entre dashboard/produto/área
7. ~~Reescrever `estado-atual.md`, `discrepancias.md`, `arquitetura.md`, `novas-analises.md`, `melhorias-pendentes.md`~~ Resolvido em 30/07/2026: os três primeiros removidos (conteúdo 100% superado, sem valor além do que `docs/historia-do-projeto.md` já resume), `melhorias-pendentes.md` teve os itens ainda abertos migrados para `docs/continuar.md` §8 e foi removido, `novas-analises.md` foi desmarcado como histórico (é backlog de feature, não diagnóstico de código: segue válido)
8. Paralelizar `diagnoseData` (6 queries sequenciais → `Promise.all`)
9. Adicionar `.max()` no schema Zod de `insertSalesChunk`
10. Mecanismo de revogação de sessão sob demanda ("logout everywhere") ou refresh token: hoje só revoga no reset de senha (ver "Dívida Técnica" #5)

---

## Observações

Análise gerada manualmente em 22/07/2026, via leitura completa do código-fonte + execução real de `lint`/`typecheck`/`test`/`coverage` (não apenas inspeção estática). Achados de segurança e infraestrutura foram verificados de forma independente (grep direto + leitura de arquivo), não apenas reportados por uma única fonte. Atualizada na mesma data após uma rodada de correções que resolveu todos os itens Crítico e Alto abertos até então.
