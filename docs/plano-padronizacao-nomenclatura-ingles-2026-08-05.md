# Plano: padronização de nomenclatura em inglês (Fase 2/3)

Continuação do pedido de 2026-08-05 de padronizar todo o projeto para
nomenclatura técnica em inglês (regra completa em `AGENTS.md`, seção
"Idioma"). A Fase 1 (itens pequenos, sem tocar banco) foi executada no
mesmo dia. Este documento cobre o que ficou de fora dessa rodada, por quê,
e como executar quando for a vez.

## Status

- `matricula` -> `employee_id`: **concluído** (PR 1 #203 schema aditivo, PR
  2 #204 corte de aplicação, PR 3 #205 limpeza/DROP COLUMN). Dividido do
  restante desta Fase 2 por decisão do usuário: escopo contido (só a
  tabela `users`, zero stored procedure envolvida, confirmado lendo o
  `migrate-schema.sql` inteiro). Coluna `matricula` removida do banco,
  `employee_id` é a única fonte de verdade.
- `depto/secao/grupo/subgrupo/val_vda`: **não aplicável, decisão do
  usuário 2026-08-05**. Não é nomenclatura arbitrária escolhida pelo time:
  transcreve quase literalmente os cabeçalhos reais da planilha de
  exportação da GPA (`NOM_DEPTO | NOM_SECAO | NOM_GRUPO | NOM_SUBGRUPO |
  NOM_PROD | VAL_VDA`, ver comentário em `scripts/migrate-schema.sql:108`).
  Diferente de `matricula` (conceito só interno, sem contrato externo
  nenhum ditando o nome), traduzir aqui criaria uma camada permanente de
  tradução mental entre o que a planilha manda e o que o banco guarda, sem
  ganho real, para um risco desproporcional: 9 stored procedures com
  histórico documentado de regressão real de performance quando mexidas
  sem medir (PR #9, 23,0s -> 30,6s, revertido). Regra registrada em
  `AGENTS.md` (seção "Idioma", exceção de domínio). O plano detalhado que
  chegou a ser desenhado para este rename fica preservado abaixo como
  registro histórico, não como pendência.

## Por que não entrou na Fase 1

Auditoria (2 agentes de exploração, cobrindo código-fonte, banco de dados,
migrations, rotas, CI/CD e testes) encontrou dois bolsões grandes demais
para uma rodada só, cada um com seu próprio risco:

1. Vocabulário de domínio vazado do schema do banco para o código:
   `depto`, `secao`, `grupo`, `subgrupo`, `val_vda` (hierarquia de produto +
   valor de venda) e `matricula` (login). Renomear exige migração de schema
   preservando dados, redefinição de stored procedures e atualização
   coordenada de ~31 arquivos de aplicação. Alto risco se apressado, baixo
   risco se feito em PRs sequenciais (mesmo padrão que funcionou na
   refatoração de auth username/matrícula, PRs #196-#198).
2. ~1.437 linhas de comentário em português, espalhadas por 91 arquivos.
   Uma PR única de tradução em massa geraria um diff enorme e irrevisável,
   com risco real de perder nuance no "porquê" de comentários que
   justificam decisões arquiteturais. Melhor tradução incremental, arquivo
   por arquivo, conforme forem tocados por outro motivo (regra já em
   `AGENTS.md`).

## Fase 2 (histórico, não aplicável): plano que chegou a ser desenhado para depto/secao/grupo/subgrupo/val_vda

Preservado como registro de por que a ideia foi avaliada e descartada (ver
"Status" acima), não como trabalho pendente.

### Nomes de destino que tinham sido cogitados

| Atual | Novo |
|---|---|
| `depto` | `department` |
| `secao` | `section` |
| `grupo` | `product_group` (não `group`: palavra reservada em SQL) |
| `subgrupo` | `subgroup` |
| `val_vda` | `sale_value` |
| `matricula` | `employee_id` (decisão do usuário, 2026-08-05) |

### Escopo no banco (`scripts/migrate-schema.sql` + nova migration)

- Colunas a renomear via `RENAME COLUMN` (preserva dados, não recria
  tabela): `staging_sales`, `sales_prod_daily_agg`, `filter_hierarchy`,
  `product_universe` (`depto/secao/grupo/subgrupo`); `staging_sales`,
  `sales_daily_agg`, `sales_prod_daily_agg` (`val_vda`); `users`
  (`matricula`).
- Índices a recriar com nome novo: `idx_filter_depto/secao/grupo/subgrupo`,
  `idx_pu_depto/secao/grupo/subgrupo`, `idx_users_matricula`.
- Stored procedures a redefinir no baseline idempotente (parâmetros e
  variáveis locais usam os nomes antigos como `p_deptos`, `p_secoes`,
  `p_grupos`, `p_subgrupos`, `v_has_depto`, etc.): `dashboard_metrics`,
  `dashboard_rankings`, `filter_options`, `area_analysis`,
  `area_filter_hierarchy`, `refresh_filter_hierarchy`,
  `refresh_product_universe`, mais qualquer uma que referencie `matricula`
  (checar `has_role` e as de auth/usuário).

### Escopo na aplicação

Todo arquivo que hoje referencia essas colunas via SQL cru ou via
identificador TypeScript. Já mapeado pela auditoria (~31 arquivos), entre
eles: `src/hooks/use-area-products-view.ts`, `src/components/filter-bar.tsx`,
`src/components/area-filters.tsx`, `src/lib/filter-cascade.ts`,
`src/lib/xlsx-parser.ts`, `src/lib/staging-row.ts`,
`src/lib/dashboard.functions.ts`, `src/lib/api-types.ts`,
`src/lib/schemas.ts` (`MatriculaSchema`), `src/lib/session.ts`
(`userMatricula`), `src/lib/auth-api.ts`, `src/lib/admin-users.functions.ts`,
`src/components/create-user-dialog.tsx`,
`src/components/edit-user-identifiers-dialog.tsx`, e os testes
correspondentes de cada um.

**Atenção**: `matricula`/`MatriculaSchema` foram criados HOJE (2026-08-05)
na refatoração de auth (PRs #196-#201) e são a peça mais recente e mais
testada em produção do sistema. Renomear exige o mesmo cuidado (testes,
validação em navegador real, deploy monitorado) daquela refatoração, não
um find-and-replace mecânico.

### Sequenciamento recomendado (3 PRs, mesmo padrão da refatoração de auth)

1. **Schema aditivo**: `ALTER TABLE ... RENAME COLUMN` em nova migration
   versionada, redefinição das procedures no baseline. Não muda
   comportamento da aplicação ainda (ela continua lendo o nome antigo até
   o PR 2).
2. **Corte da aplicação**: todo o código passa a usar os nomes novos,
   testes atualizados, docs atualizadas. Não dá pra ir por partes: uma vez
   que a coluna renomeou no banco, o código velho quebra.
3. **Limpeza**: remover qualquer referência residual, atualizar
   `README.md`/`AGENTS.md` se necessário, confirmar em produção.

Fazer o rename de `matricula` num PR separado dos demais (`depto` etc.):
são mudanças independentes, e misturar aumenta o raio de um possível
rollback.

## Fase 3: tradução de comentários em português

Revisão: o usuário pediu explicitamente um esforço dedicado, por etapas
("vamos traduzir os comentários por etapa. você decide onde começar."),
substituindo a estratégia original de "só quando o arquivo for tocado por
outro motivo". Cada etapa é um PR próprio, escopo por diretório, só
comentários (`//` e `/** */`), sem mudança de comportamento, verificado via
`git diff` linha a linha.

### Status
- **Etapa 1** (concluída, PR #207): 12 arquivos não-teste de `src/lib/`
  (auth/segurança: `admin-users.functions.ts`, `admin-utils.ts`,
  `audit-tooltip.ts`, `audit.ts`, `auth-api.ts`, `auth-config.ts`,
  `auth-middleware.ts`, `rate-limit.middleware.ts`, `rate-limit.ts`,
  `schemas.ts`, `session.ts`, `turnstile.ts`).
- **Etapa 2** (concluída, PR #209): 9 arquivos não-teste de `src/hooks/`.
- **Etapa 3** (concluída, PR #211): 12 arquivos não-teste de `src/lib/`
  (parte 1, os menores por volume de comentário): `heartbeat.ts`,
  `upload.functions.ts`, `sanitize-next.ts`, `boot-guards.ts`,
  `dashboard.functions.ts`, `content-disposition.ts`, `staging-row.ts`,
  `cache.ts`, `export-pdf.ts`, `csp-server.ts`, `xlsx-parser.ts`,
  `admin-system.functions.ts`.
- **Etapa 4** (concluída, PR #212): os 10 arquivos restantes de `src/lib/`
  (parte 2): `retention.ts`, `utils.ts`, `date-window.ts`,
  `instrument-server.ts`, `query-config.ts`, `pdf-download-store.ts`,
  `filter-cascade.ts`, `area.functions.ts`, `import-config.ts`, `csp.ts`.
  **`src/lib/` está completo.**
- **Etapa 5** (concluída, PR #213): 8 arquivos de `src/routes/` com
  comentários em português (`route.tsx`, `upload.page.tsx`, `__root.tsx`,
  `index.page.tsx`, `product.page.tsx`, `admin.docs.page.tsx`,
  `change-password.tsx`, `area.tsx`). Os demais arquivos de rota (wrappers
  finos, sem lógica) não tinham comentários. **`src/routes/` está completo.**
- **Etapa 6** (concluída, PR #214): 13 arquivos de `src/components/` com
  comentários em português (`route-progress.tsx`, `import-calendar.tsx`,
  `area-filters.tsx`, `error-boundary.tsx`, `product-charts.tsx`,
  `edit-user-identifiers-dialog.tsx`, `date-range-picker.tsx`,
  `dashboard-charts.tsx`, `admin-user-management.tsx`,
  `upload-dropzone.tsx`, `create-user-dialog.tsx`, `command-palette.tsx`,
  `admin-gate.tsx`). Os demais arquivos do diretório não tinham comentários
  em português. **`src/components/` está completo.**
- **Etapa 7** (concluída, PR #215): 15 scripts não-SQL de `scripts/` com
  comentários em português (`bench-procs.sh`, `import-watch.ts`,
  `validate-procs.sh`, `setup-crons.sh`, `coverage-thresholds.ts`,
  `run-migrations.sh`, `lib/sentry-cron.ts`, `bench-experiment-rankings.sh`,
  `backfill-null-categories.ts`, `prebuild-version-manifest.mjs`,
  `purge-aggs.ts`, `refresh-universe.ts`, `postbuild-restore-manifest.mjs`,
  `create-test-admin.ts`, `import.ts`). Mensagens de log/console (saída de
  operador) mantidas em português, mesmo critério das etapas anteriores.
- **Restante, não iniciado**:
  - `scripts/migrate-schema.sql`: 209 linhas de comentário SQL, majoritariamente
    dentro das stored procedures. Deixado de fora da etapa 7 de propósito,
    dado o histórico de cautela desta sessão com mudanças nessas procedures
    (ver Fase 2 acima); fica para uma etapa dedicada, com o mesmo cuidado de
    validação (`schema-check` do CI, `validate-procs.sh`).
  - `scripts/migrations/*.sql`: forward-only, imutáveis por design mesmo
    para comentários (ver exceção documentada na seção "Idioma" do
    `AGENTS.md`) -- não aplicável, não uma pendência.
  - **Etapa 8** (concluída, PR #216): 16 arquivos de teste com mais linhas
    de comentário em português (`auth-api.test.ts`, `xlsx-parser.test.ts`,
    `utils.test.ts`, `pdf-download-store.test.ts`, `csp.test.ts`,
    `auth-middleware.test.ts`, `upload.functions.test.ts`,
    `rate-limit.middleware.test.ts`, `export-pdf.test.ts`,
    `upload.functions.guards.test.ts`, `area.functions.test.ts`,
    `admin-user-management.test.tsx`, `use-wake-lock.test.ts`,
    `retention.test.ts`, `admin-users.functions.guards.test.ts`,
    `admin-docs.functions.guards.test.ts`).
  - **Etapa 9** (concluída, PR #217): os 16 arquivos de teste restantes com
    comentário em português (`staging-row.test.ts`, `sanitize-next.test.ts`,
    `rate-limit.test.ts`, `dashboard.functions.test.ts`,
    `admin-system.functions.guards.test.ts`, `use-area-pdf-export.test.ts`,
    `admin-audit-panel.test.tsx`, `admin-utils.test.ts`, `date-window.test.ts`,
    `audit-tooltip.test.ts`, `api-types.test.ts`,
    `admin-users.functions.test.ts`, `admin-docs.functions.test.ts`,
    `use-nav-pending.test.ts`, `filter-cascade.test.ts`,
    `use-area-products-view.test.ts`). **Todos os arquivos de teste com
    comentário em português estão traduzidos.**
  - Strings de descrição `it("...")`/`describe("...")` em português
    continuam fora de escopo (categoria própria, ainda não iniciada).
  - **Estado geral da tradução de comentários (Fase 3)**: `src/lib/`,
    `src/hooks/`, `src/routes/`, `src/components/`, `scripts/` (não-SQL) e
    todos os arquivos de teste estão completos (Etapas 1-9, PRs #207, #209,
    #211-#217). Só restam `scripts/migrate-schema.sql` (209 linhas de
    comentário SQL, majoritariamente dentro das stored procedures --
    etapa dedicada futura, dado o histórico de cautela desta sessão com
    essas procedures) e as strings de descrição de teste (categoria à
    parte, ver acima).

Nomes próprios de tela (ex.: "Área", "Documentação", "Administração") são
mantidos como estão em qualquer etapa, mesmo dentro de comentários --
critério fixado na etapa 1.

O mesmo vale para strings de descrição de teste (`it("...")`,
`describe("...")`) em português, encontradas durante a auditoria mas fora
do escopo original do pedido (fala de "nomenclatura", não de descrições de
teste): tratamento incremental, mesmo critério, ainda não iniciado.

## Verificação (quando a Fase 2 for executada)

- `bun run lint` / `bun run typecheck` / `bun run test`
- Rodar as 8 migrations + baseline do zero num banco local (mesmo que o
  `schema-check` do CI faz) para provar idempotência antes de mergear
- Validação em navegador real (Puppeteer): login por matrícula/employee_id,
  tela de Área com os filtros de hierarquia, dashboard com rankings
- Checar Sentry por erro novo após o deploy de cada PR desta sequência
