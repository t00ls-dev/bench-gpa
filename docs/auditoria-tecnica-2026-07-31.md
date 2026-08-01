# Auditoria Técnica Completa: bench-gpa (31/07/2026)

Due diligence técnica completa do repositório, no mesmo rigor de uma auditoria
pré-aquisição: arquitetura, código morto, dependências, performance, banco de
dados, segurança, infraestrutura/CI/CD e documentação. Conduzida via 6
investigações paralelas com verificação cruzada manual dos achados críticos.
Commit auditado: `33fc442`. Versão navegável (com tabelas, chips de
severidade e barras de nota) publicada como artifact separado na mesma
sessão.

Ver também: `docs/continuar.md` (histórico de decisões) e
`docs/medicao-performance.md` (benchmarks de banco já medidos, não
repetidos aqui).

## Notas por categoria (0-10)

| Categoria           |    Nota | Justificativa resumida                                                                                                                                                |
| ------------------- | ------: | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Arquitetura         |     7.5 | Padrão único confirmado em banco/validação/auth/cache; perde ponto por um arquivo de 571 linhas com 4 responsabilidades e duplicação pequena de paginação             |
| Performance         |     7.5 | Procs caras já cacheadas e medidas, bundle já dividido por rota, tabela grande já virtualizada; achados restantes são todos de baixo esforço                          |
| **Segurança**       | **4.5** | Nenhuma vulnerabilidade clássica de app (SQLi/XSS/CSRF/SSRF), mas segredo de produção exposto no histórico do git domina a nota                                       |
| Escalabilidade      |     5.0 | Teto estrutural de infraestrutura (1 núcleo, 1,9GB compartilhado, PM2 fork único, cache em memória de processo): decisão de custo consciente, não falha de engenharia |
| Organização         |     7.5 | Sem fragmentação de padrão nos eixos centrais; ruído cosmético localizado (config morta, scripts de debug obsoletos)                                                  |
| Legibilidade        |     7.5 | Comentários explicam o não-óbvio de forma consistente; exceções pontuais (FK sem nota, funções de data sem nota cruzada)                                              |
| Manutenibilidade    |     7.0 | Cobertura de teste real (74,2%) concentrada no risco certo; mas `noUnusedLocals`/`no-unused-vars` desligados sem explicação já deixaram passar código morto           |
| Infraestrutura      |     6.5 | Deploy com rollback automático real e migrations antes do swap; mas zero auditoria de dependência no CI e zero rotação de log                                         |
| Documentação        |     7.0 | `continuar.md`/`medicao-performance.md` são um diferencial real; drift pontual (README contraditório, feature removida ainda listada)                                 |
| **Qualidade geral** | **6.8** | Julgamento ponderado, não média aritmética: pesa o achado crítico de segurança e a ausência de rede de segurança automatizada para dependências                       |

---

## Achado crítico: tratar antes de qualquer outro item

**Segredos de produção no histórico do git.** O commit `411ef7d`
(21/07/2026) tem um `.env` versionado em texto puro com `JWT_SECRET`,
`DB_PASS` e `TURNSTILE_SECRET_KEY` reais. O arquivo foi removido do
tracking 8 commits depois (`67fb11d`), mas o histórico **nunca foi
reescrito** para ele: só os `.xlsx` passaram pelo `git filter-repo`
(item 6 de `continuar.md`). Recuperável hoje via `git show
411ef7d:.env`. Repo é privado, o que reduz mas não elimina o risco.
Commits ainda mais antigos também expõem uma `SUPABASE_SERVICE_ROLE_KEY`
da era pré-migração.

**Correção**: rotacionar `JWT_SECRET`/`DB_PASS`/`TURNSTILE_SECRET_KEY`
em produção se ainda forem os valores atuais, depois `git filter-repo
--path .env --invert-paths` + `push --force` (mesma técnica já usada
para os XLSX).

---

## Pontos fortes

- Deploy com **rollback automático real**: healthcheck HTTP após o
  swap; se falhar, restaura `.output.old` e reaplica o PM2 antigo
  (`ci.yml:188-219`): código que executa, não script de sorte.
- Migrations aplicadas **antes** do swap de código, com o pipeline
  parando se falharem: schema nunca fica dessincronizado.
- Cobertura de teste real em 74,2%, concentrada nas server functions
  de maior risco (upload, dashboard, admin).
- Cultura de medir antes de mudar: toda decisão de performance no
  banco tem número real de produção por trás, incluindo uma regressão
  documentada e revertida em vez de escondida.
- Nenhuma vulnerabilidade clássica de aplicação web (SQLi, XSS, CSRF,
  SSRF, path traversal, command injection) em nenhuma rota auditada.
- Bundle já dividido corretamente por rota; libs pesadas (jsPDF,
  Recharts, parser XLSX) carregadas sob demanda, confirmado com
  números reais de build, não hipótese.

## Pontos fracos

- Segredo de produção plausivelmente ativo, exposto há 10 dias, nunca
  rotacionado nem purgado (ver achado crítico acima).
- Zero auditoria automatizada de dependências no CI: as duas CVEs já
  corrigidas (`seroval`, `xlsx`) foram achadas manualmente, e uma
  delas (`seroval`) **voltou** via cópias transitivas sem ninguém notar.
- Duas stored procedures (`refresh_product_universe`,
  `purge_old_aggs`) perderam garantias transacionais que seus próprios
  comentários afirmam existir.
- Escalabilidade limitada por infraestrutura: 1 núcleo, 1,9GB
  compartilhados com dois outros sites, cache de aplicação em memória
  de processo único.
- Rede de segurança que pegaria código morto automaticamente
  (`noUnusedLocals`/`no-unused-vars`) está desligada sem explicação.
- Documentação com drift pontual: README se contradiz e lista uma
  feature já removida do produto.

---

## Código morto

| Item                                                      | Local                                                                                   | Risco de remoção | Prioridade |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------- | ---------------- | ---------- |
| `safeError()` nunca invocada em produção                  | `src/lib/safe-error.ts:3-25`                                                            | Baixo            | Média      |
| Parâmetro `label` de `assertAdmin` nunca lido             | `src/lib/admin-utils.ts:39`                                                             | Baixo            | Baixa      |
| `src/components/ui/toggle.tsx` órfão (0 imports)          | `ui/toggle.tsx`                                                                         | Baixo            | Baixa      |
| 4 scripts de debug ad-hoc, credenciais/portas obsoletas   | `scripts/debug-*.mjs`, `test-viewports.mjs`                                             | Baixo            | Baixa      |
| `backfill-null-categories.ts` solto na raiz de `scripts/` | `scripts/backfill-null-categories.ts`                                                   | Médio            | Baixa      |
| ~10 exports/tipos sem consumidor externo                  | `filter-cascade.ts`, `rate-limit.ts`, `schemas.ts`, `use-hotkey.ts`, `extract-date.ts`… | Baixo            | Baixa      |

## Dependências

**Vulnerabilidades ativas no caminho de produção:**

- **`seroval` (crítico)**: pin de `^1.5.6` no topo do `package.json`,
  mas `@tanstack/router-core`/`start-client-core`/`start-plugin-core`/
  `start-server-core` carregam cada um sua própria cópia aninhada de
  `seroval@1.5.2` (vulnerável), sem dedupe: exatamente a superfície
  de deserialização de resposta de server function da CVE. Correção:
  atualizar o TanStack Start/Router para a série que já embute
  `seroval>=1.5.3`, e mover o pin para `overrides` real (não
  `pnpm.overrides`, que o bun ignora).
- **`@tanstack/start-server-core` (alto)**: `@tanstack/react-start@
1.167.50` fixa `start-server-core@1.167.22`, abaixo do patch
  `1.167.30` que corrige uma CVE moderada de deserialização de
  request. Correção: bump para a série 1.168–1.170.

**Removíveis/mal configuradas**: bloco `pnpm.overrides` morto (sintaxe
que o bun não lê); `@radix-ui/react-toggle` (só sustenta o componente
órfão); `bcrypt` nativo é candidato a `Bun.password` (mesmo formato de
hash `$2b$`, já que o runtime é 100% bun).

**Confirmadas em ordem, sem ação**: `xlsx` via CDN do SheetJS
continua substituindo o pacote npm vulnerável; `jspdf`/`jspdf-autotable`
pesam 29MB em disco mas o bundle real é ~386KB carregado sob demanda;
`recharts`/`zod` uma major atrás cada, sem CVE pendente.

## Performance

| Achado                                    | Local                                      | Severidade | Correção                                |
| ----------------------------------------- | ------------------------------------------ | ---------- | --------------------------------------- |
| TTL de cache implícito (60s por acidente) | `area.functions.ts:108`                    | Médio      | Passar `CACHE_TTL_SHORT` explicitamente |
| `diagnoseData`: 7 round-trips sequenciais | `admin-system.functions.ts:37-55`          | Baixo      | `Promise.all`                           |
| `getAuditLog`/`dbHealthCheck` sequenciais | `admin-system.functions.ts:93-108,144-150` | Baixo      | `Promise.all`                           |
| Filtro+paginação de usuários sem memo     | `admin-user-management.tsx:85-100`         | Baixo      | `useMemo`                               |

Verificado e descartado como não-problema: bundle já dividido
corretamente, tabela de Área já virtualizada, nenhuma operação
bloqueante no servidor, nenhum context re-renderizando árvore à toa.

## Segurança

| Achado                                        | Severidade | Correção                                                               |
| --------------------------------------------- | ---------- | ---------------------------------------------------------------------- |
| Segredos de produção no histórico do git      | Crítico    | Rotacionar + `filter-repo --path .env --invert-paths`                  |
| Logout não revoga `token_version` no servidor | Alto       | Incrementar `token_version` no logout, mesmo padrão de `resetPassword` |
| Rate limit de login só por IP (não por conta) | Médio      | Segundo balde por e-mail normalizado (ex.: 5/15min)                    |
| Sem HSTS na própria aplicação                 | Baixo      | Adicionar header em `applySecurityHeaders` (`server.ts`)               |

Verificado e sem achado: SQL injection, XSS, CSRF, SSRF, path
traversal, command injection, enumeração de usuário, cost do bcrypt,
cobertura universal de `token_version`, algoritmo JWT restrito a HMAC.

## Infraestrutura & CI/CD

Pontos fortes: swap atômico com rollback automático real; migrations
antes do swap; concorrência de CI corretamente segmentada (`ci`
cancelável, `deploy` não).

Lacunas: zero `bun audit`/Dependabot/CodeQL no CI (causa raiz das duas
CVEs não pegas automaticamente); sem log rotation (PM2 nem cron); o
healthcheck de deploy só confere `200` na home, não pega regressão em
rota específica; sem `Cache-Control: immutable` explícito para assets
já content-hashed.

## Arquitetura & organização

Confirmado: padrão único para acesso a banco, validação, autorização
admin e split cache-servidor/cliente, sem fragmentação nos eixos
centrais.

| Achado                                                  | Local                                  | Correção                                                 |
| ------------------------------------------------------- | -------------------------------------- | -------------------------------------------------------- |
| Lint de código morto desligado sem explicação           | `tsconfig.json`, `eslint.config.js:23` | Religar `noUnusedLocals`/`no-unused-vars`, triar backlog |
| `area.page.tsx` com 4 responsabilidades (571 linhas)    | `area.page.tsx`                        | Extrair `useAreaProductsView`/`useAreaPdfExport`         |
| Paginação duplicada sob nome que não descreve os 2 usos | `AREA_PAGE_SIZE_OPTIONS`               | Renomear, considerar `usePagination()`                   |
| Ciclo `X.tsx` ↔ `X.page.tsx` (intencional, não é bug)   | `routes/_authenticated/*`              | Documentar em `routes/README.md`                         |

## Banco de dados

| Achado                                                                                                                                    | Local                                                               | Risco  | Correção                                                   |
| ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | ------ | ---------------------------------------------------------- |
| `refresh_product_universe`/`refresh_filter_hierarchy` sem transação: garantia do comentário é falsa desde que saíram de `finalize_import` | `migrate-schema.sql:1097-1143`                                      | Médio  | `START TRANSACTION`/`COMMIT` no molde de `finalize_import` |
| `purge_old_aggs` sem transação/handler: purge parcial possível                                                                            | `migrate-schema.sql:1022-1063`                                      | Médio  | Mesmo padrão                                               |
| `idx_prod_daily_sale_date` provavelmente morto (63MB), mesmo padrão dos 4 índices já removidos                                            | `migrate-schema.sql:115`                                            | Baixo  | Medir com `bench-procs.sh`, formalizar migration `0005`    |
| 3 índices redundantes com PK/UNIQUE                                                                                                       | `idx_products_prod_code`, `idx_import_sale_date`, `idx_users_email` | Baixo  | `DROP INDEX`                                               |
| Ausência de FK sem comentário explicando (única decisão não documentada do schema)                                                        | schema todo                                                         | Nenhum | Comentário de 1-2 linhas                                   |

## Documentação

| Inconsistência                                   | Local                      | Realidade                                  |
| ------------------------------------------------ | -------------------------- | ------------------------------------------ |
| README lista "PDF export" em Dashboard e Produto | `README.md:58-59`          | Removido no commit `fc7d92b` (#56)         |
| README se contradiz no rate limit de Auth        | `README.md:107` vs `:108`  | Real é 10/min IP                           |
| `coverage-summary.md` mostra 55,6%               | `docs/coverage-summary.md` | Real hoje é 74,2%, artefato não regenerado |
| `continuar.md` não reflete PRs #71/#72           | `docs/continuar.md:261`    | Ainda descreve feature já removida depois  |

---

## Ações priorizadas

1. Concluído em 31/07: rotacionar segredos de produção e purgar `.env` do histórico do git (crítico, esforço baixo).
2. Concluído em 31/07: corrigir CVE crítica de `seroval` nas cópias transitivas do TanStack (crítico, esforço baixo).
3. Concluído em 31/07: adicionar `bun audit`/Dependabot ao CI (alto, esforço baixo, previne recorrência dos itens 1-2).
4. Concluído em 31/07: `@tanstack/react-start` está em 1.168.33 (bem além do patch 1.167.30 da CVE moderada) via bumps de rotina, sem ação isolada necessária.
5. Concluído em 31/07: logout revogar `token_version` (alto, esforço baixo).
6. Concluído em 31/07: restaurar transação em `refresh_product_universe`/`refresh_filter_hierarchy` e `purge_old_aggs` (médio, esforço baixo).
7. Concluído em 31/07: rate limit de login por conta (5/15min por e-mail, balde independente do por-IP), médio, esforço médio.
8. Concluído em 31/07: `pm2-logrotate` instalado (10M/rotação, retém 14, comprimido) para os logs do PM2; `logrotate.d` do sistema adicionado para `purge.log`/`refresh-universe.log` (cron puro, fora do PM2), médio, esforço baixo.
9. Concluído em 31/07: TTL explícito (`CACHE_TTL_SHORT`) em `getAreaAnalysis`; `diagnoseData`/`dbHealthCheck`/`getAuditLog` paralelizados com `Promise.all`, médio, esforço trivial.
10. Concluído em 31/07: `noUnusedLocals`/`no-unused-vars`/`noUnusedParameters` religados; 17 erros triados (2 eram bugs reais: `disabled` do dropzone e log sem URL em `start.ts`; corrigidos de verdade, não só silenciados), médio, esforço médio.
11. Concluído em 31/07: README corrigido (contradição 5min/10min no tier Auth, cron `import-watch` removida trocada por `refresh-universe`) e `coverage-summary.md` regenerado, baixo, esforço trivial.
12. Concluído em 31/07: `toggle.tsx`/`@radix-ui/react-toggle`, `safe-error.ts` (órfão), `assertAdmin(label)`, 5 scripts de debug e ~10 exports sem consumidor externo removidos. `pnpm.overrides` já não existia (resolvido em sessão anterior). `backfill-null-categories.ts` mantido: risco médio de remoção, prioridade baixa, não confirmado se já rodou em produção, baixo, esforço trivial.

## Plano de refatoração em 5 fases

**Fase 1: Correções críticas**: segredos no histórico do git;
`seroval`/`start-server-core` desatualizados.

**Fase 2: Performance**: TTL implícito de `getAreaAnalysis`;
round-trips sequenciais em rotas admin.

**Fase 3: Simplificação**: código morto e dependências órfãs;
documentação desatualizada.

**Fase 4: Arquitetura**: transações ausentes nas duas procs de
manutenção; `area.page.tsx` com 4 responsabilidades.

**Fase 5: Otimizações finais**: índices redundantes com PK/UNIQUE;
`idx_prod_daily_sale_date` possivelmente morto.

Detalhe de problema/causa/impacto/solução/dificuldade/risco/ganho por
item de cada fase está na versão navegável (artifact) gerada na mesma
sessão desta auditoria.
