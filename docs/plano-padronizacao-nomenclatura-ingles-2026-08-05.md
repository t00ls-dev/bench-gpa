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
  `upload-dropzone.tsx`, `create-user-dialog.tsx`, `admin-gate.tsx`). Os demais
  arquivos do diretório não tinham comentários
  em português. **`src/components/` está completo.**
- **Etapa 7** (concluída, PR #215): 15 scripts não-SQL de `scripts/` com
  comentários em português (`bench-procs.sh`, `import-watch.ts`,
  `validate-procs.sh`, `setup-crons.sh`, `coverage-thresholds.ts`,
  `run-migrations.sh`, `lib/sentry-cron.ts`, `bench-experiment-rankings.sh`,
  `backfill-null-categories.ts`, `prebuild-version-manifest.mjs`,
  `purge-aggs.ts`, `refresh-universe.ts`, `postbuild-restore-manifest.mjs`,
  `create-test-admin.ts`, `import.ts`). Mensagens de log/console (saída de
  operador) mantidas em português, mesmo critério das etapas anteriores.
- `scripts/migrate-schema.sql` (209 linhas de comentário SQL, majoritariamente
  dentro das stored procedures) foi deixado de fora da etapa 7 de propósito;
  concluído na etapa 10 abaixo, com o cuidado de validação extra que o
  histórico desta sessão com essas procedures exigia.
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
  - **Etapa 10** (concluída, PR #218): `scripts/migrate-schema.sql`
    inteiro -- comentários de tabela e os 16 blocos de comentário das
    stored procedures. Validado além do lint/typecheck/test padrão: cadeia
    completa de migrations do zero com reexecução (idempotência) e
    `scripts/validate-procs.sh` (37 cenários) rodado contra ~2M linhas de
    dados reais antes/depois de reaplicar o schema, hash de ordem e de
    conjunto idênticos nos 37 cenários. **`scripts/migrate-schema.sql` está
    completo.**
  - **Etapa 13** (concluída, PR #222): os 4 arquivos de entrada na raiz de
    `src/` (`router.tsx`, `client.tsx`, `start.ts`, `server.ts`) -- lacuna
    real encontrada numa varredura de conferência em 2026-08-06: o escopo
    das etapas 1-10 nunca incluiu `src/*.ts(x)` diretamente, só os
    subdiretórios. Validado com o mesmo rigor da etapa 10, dado que são os
    arquivos de bootstrap mais críticos do app: build de produção completo,
    servidor real subido, teste em navegador via Puppeteer (login,
    hidratação sem erro de console, navegação entre rotas).
  - **Etapa 14** (concluída, PR #223): `.github/workflows/ci.yml` (79
    linhas de comentário) e `.github/dependabot.yml` (5 linhas), mais 4
    arquivos de configuração na raiz nunca cobertos por nenhuma etapa
    anterior -- `vite.config.ts`, `vitest.config.ts`, `vitest.setup.ts`,
    `ecosystem.config.cjs`. Segunda lacuna real encontrada numa varredura
    de conferência em 2026-08-06 (a etapa 1 só traduziu os 7 rótulos
    `name:` de step do `ci.yml`, nunca os comentários internos do
    arquivo). Validado com o mesmo rigor da etapa 10/13, dado que
    `ci.yml` define o próprio pipeline de deploy: sintaxe YAML checada
    com `python3 -c "import yaml; yaml.safe_load(...)"` para os dois
    arquivos `.github/*.yml`, e `ecosystem.config.cjs` recarregado via
    `node -e "require(...)"` confirmando que os valores reais de config
    (`script`, `instances`, `exec_mode`, `listen_timeout`) ficaram
    byte-idênticos aos originais. Strings de saída de operador
    (`echo`/`console.log`) e a checagem funcional
    `grep -q "nenhuma migration nova"` no job `schema-check` (que depende
    do texto literal em português de `scripts/run-migrations.sh`)
    mantidas intactas, mesmo critério das etapas anteriores.
  - **Etapa 15** (concluída, PR #225): `.env.example` (7 linhas de
    comentário) e `.gitignore` (18 linhas, incluindo o bloco explicando
    a história do diretório `data/`) -- terceira e última lacuna
    encontrada numa varredura de conferência em 2026-08-06. Também
    traduzidos os dois placeholders de valor em português dentro de
    `.env.example` (`<senha>` -> `<password>`, `<senha_admin_teste>` ->
    `<test_admin_password>`), consistente com os demais placeholders do
    mesmo arquivo que já estavam em inglês. `bunfig.toml`,
    `tsconfig.json`, `eslint.config.js` e `components.json` conferidos
    na mesma varredura e já não têm comentário em português.
  - **Estado geral da tradução de comentários (Fase 3)**: `src/` (incluindo
    os 4 entry points na raiz), `scripts/` (todos, incluindo
    `migrate-schema.sql`), todos os arquivos de teste, o pipeline de
    CI/CD (`.github/`) e todos os arquivos de configuração de
    build/teste/ambiente na raiz estão completos (Etapas 1-10, 13, 14 e
    15, PRs #207, #209, #211-#218, #222, #223, #225). **A tradução de
    comentários técnicos do projeto inteiro está concluída -- não resta
    nenhum comentário em português em nenhum arquivo versionado, fora
    `.md` e as 5 migrations já aplicadas, exceção documentada por
    design do próprio mecanismo de migration.**

### Reavaliação dos nomes próprios de tela (2026-08-06)

Depois da etapa 15, o usuário pediu para revisitar item a item as
exceções fixadas ao longo da iniciativa. Decisões:

- **`depto`/`secao`/`grupo`/`subgrupo`/`val_vda`**: mantido em português
  (confirmado). Continua vocabulário de domínio externo (cabeçalho da
  planilha da GPA), não nomenclatura arbitrária.
- **Nomes de arquivo das 5 migrations já aplicadas**: mantido (confirmado).
  Não é escolha de estilo, é limitação do próprio mecanismo do runner
  (`schema_migrations` rastreia por nome de arquivo).
- **Nomes próprios de tela** (`Área`, `Documentação`, `Administração`,
  `Loja`): diferente de `depto` etc., são nomes inventados pelo próprio
  time (sem contrato externo ditando o termo) -- **traduzidos** dentro de
  comentários/JSDoc para `Area`, `Docs`, `Admin`, `Store` (Etapa 16, PR
  #226). O texto de UI renderizado ao usuário (labels de navegação,
  títulos de tela, PDF) **não muda**, continua em português. `Brasília`
  (nome de cidade real) e `Loja` quando usado como dado literal em
  fixtures de teste (ex. `"Loja Centro"`, simulando `store_name` real do
  banco) **mantidos** -- não são nomes inventados pelo time, são
  vocabulário/dado externo.
- **Etapa 16** (concluída, PR #226): `Área` -> `Area`, `Documentação`/
  `Administração` -> `Docs`/`Admin`, `Loja` -> `Store`, só onde a palavra
  aparece como referência técnica dentro de comentário/JSDoc já em
  inglês (11 ocorrências em 11 arquivos, incluindo 4 linhas de
  `scripts/migrate-schema.sql`, validado com o mesmo rigor da etapa 10).
- **Strings voltadas a operador/usuário** (`echo`, `console.log/error`,
  mensagens de `Error`, texto de audit-log, validação Zod, corpo de
  resposta HTTP de erro): o usuário definiu o critério -- fica em
  português tudo que é visível a qualquer usuário do próprio app,
  **inclusive as telas de Admin** (usuário admin conta como "usuário
  comum" para este critério, não como público técnico separado). Só vira
  inglês o que é puramente log/terminal, nunca renderizado em nenhuma
  tela do app (saída de `echo` em scripts de deploy/CI, `console.log/
  error/warn`, `Error` interna que nunca chega a uma resposta HTTP
  exibida). Etapa de mapeamento em andamento -- ver Fase 5 abaixo.

## Fase 5: strings de log/operador (não renderizadas em nenhuma tela do app)

Categoria nova, definida a partir do critério acima. Diferente das Fases
3/4 (comentários e descrições de teste, sempre seguras de traduzir), aqui
cada ocorrência exige checar o destino real da string antes de traduzir:
`console.log`/`console.error`/`console.warn` e `echo` de scripts nunca
chegam ao navegador, mas uma mensagem de `Error`/`throw` pode ou não ser
capturada e reexibida ao usuário numa tela ou resposta HTTP -- errar essa
checagem faria um usuário comum ver texto em inglês onde deveria ver
português (regressão real de UX), então cada string é confirmada
individualmente pelo ponto onde é consumida antes de entrar numa etapa.

### Mapeamento (2026-08-06)

Conferido `throw new Error(...)` com texto em português em todo `src/`
(11 ocorrências: `auth-api.ts`, `admin-docs.functions.ts`,
`admin-users.functions.ts`, `admin-utils.ts`, `xlsx-parser.ts`,
`rate-limit.middleware.ts`) e o único `SIGNAL SQLSTATE` de
`migrate-schema.sql` (já em inglês). **Nenhum muda**: todos são lançados
dentro de server functions e capturados para exibir ao usuário (erro de
login, permissão negada, erro de upload, limite de requisição) -- caso
"visível a qualquer usuário do app", fica em português.

O que sobrou como candidato real, confirmado como nunca renderizado em
nenhuma tela nem resposta HTTP:

- **Etapa 17** (concluída, PR #227): `console.*` em `src/` -- 3 arquivos,
  7 mensagens, todos server-side (`turnstile.ts`, `heartbeat.ts`,
  `audit.ts`). Log do PM2, nunca chega ao navegador.
- **Etapa 18** (concluída, PR #228): `console.*` em `scripts/*.ts`
  (CLI/cron) -- `create-test-admin.ts`, `purge-aggs.ts`,
  `refresh-universe.ts`, `backfill-null-categories.ts`,
  `extract-date.ts`, `import.ts`, `import-watch.ts`. Achado durante a
  execução: `import.ts` tem um `throw new Error("Nenhuma linha de
  venda para importar.")` idêntico ao de
  `src/lib/upload.functions.ts:27` (usado pelo fluxo real de upload
  via navegador, que permanece em português) -- são cópias
  independentes, a do script CLI standalone nunca é alcançada pelo
  app, então foi traduzida sem afetar a outra. Em `import-watch.ts` e
  nos dois scripts de cron da etapa 17
  (`purge-aggs.ts`/`refresh-universe.ts`), a string passada como
  `detail` para `recordHeartbeat(...)` foi mantida em português de
  propósito (comentário explicando o motivo): é gravada em
  `cron_heartbeat.last_detail` e renderizada no painel de admin
  (`admin-audit-panel.tsx`), não é log puro -- só os `console.log/error`
  ao redor mudaram.
- **Etapa 19** (concluída, PR #229): `echo` em `scripts/*.sh` --
  `bench-experiment-rankings.sh`, `bench-procs.sh`, `import-all.sh`,
  `run-migrations.sh`, `setup-crons.sh`, `validate-procs.sh` -- mais os
  `echo` do job de deploy de `.github/workflows/ci.yml` que tinham
  ficado de fora da etapa 14 (que só cobriu comentários `#`, não echo
  de operador). Achado durante a execução: `import-all.sh` tinha 2
  linhas de comentário em português nunca cobertas por nenhuma etapa
  anterior, traduzidas junto.

  Acoplamento funcional resolvido: `run-migrations.sh:80`
  (`echo "(nenhuma migration nova)"`) e `ci.yml:108`
  (`grep -q "nenhuma migration nova"`, job `schema-check`) mudaram
  juntos, para `"(no new migrations)"`/`"no new migrations"`.
  Reproduzido localmente o mesmo teste que o CI roda (aplicação dupla
  das migrations num banco novo + grep na saída da segunda aplicação),
  confirmando que o grep encontra a string nova antes de abrir a PR.

  Mantidos sem tradução, por decisão registrada: os identificadores de
  cenário dos arrays `SCENARIOS` (`bench-procs.sh`, referenciados em
  anos de histórico em `docs/medicao-performance.md` e
  `docs/continuar.md`) e `CASES` (`validate-procs.sh`) -- são chaves de
  correlação entre execuções, não mensagens; e nomes de variável local
  (`nome`, `sql`, `saida`), fora do escopo desta fase (só strings de
  saída, não identificadores).

  **Com isto a Fase 5 está concluída**: não resta nenhuma string de
  log/operador em português em `src/`, `scripts/*.ts` ou `scripts/*.sh`
  que não seja renderizada em alguma tela do app (as que são --
  `throw new Error` capturado por server functions, o campo `detail` de
  `recordHeartbeat`, mensagens de auditoria, validação Zod -- ficam em
  português por regra, mesmo nas telas de Admin).
- **Correção pontual** (PR #230): 2 linhas de comentário em
  `src/lib/xlsx-parser.test.ts` que escaparam das etapas 8/9 (Fase 3),
  achadas numa varredura de conferência pós Fase 5.
- **Correção pontual** (PR #231): 2 mensagens de `console.log` em
  `scripts/prebuild-version-manifest.mjs`/
  `scripts/postbuild-restore-manifest.mjs` -- rodam só dentro do
  pipeline `bun run build` (hooks `prebuild`/`postbuild` do
  `package.json`), nunca auditadas antes por serem `.mjs`, fora do
  escopo `scripts/*.ts` da etapa 18. Achado numa nova varredura de
  conferência em 2026-08-06.
- **Correção pontual** (PR #232): comentários em `scripts/migrations/
  0001` a `0008` (a Etapa 10 cobriu só `migrate-schema.sql`, o baseline
  idempotente, nunca as migrations versionadas). `0009`-`0011` já
  estavam em inglês.

  **Exceção deliberada à regra "forward-only"** de
  `scripts/migrations/README.md` ("nunca edite, nem renomeie, uma
  migration já aplicada em produção"): perguntado explicitamente ao
  usuário antes de executar, que aprovou. A regra existe porque o
  runner (`scripts/run-migrations.sh`) rastreia cada migration pelo
  NOME DO ARQUIVO em `schema_migrations` e nunca reexecuta o conteúdo
  -- editar só comentário não muda esse comportamento, mesmo
  raciocínio já documentado (e já praticado duas vezes antes) dentro
  dos próprios arquivos `0002` e `0003` ("EDITADO em 01/08/2026,
  auditoria de QA, item 10"). Zero linha de SQL tocada. `matricula`/
  `username` mantidos como identificador literal onde o comentário
  descreve a coluna SQL real daquele momento histórico (`0006`,
  `0007`), não traduzidos para `employee_id` -- coluna diferente,
  adicionada só em `0009`. Validado com a cadeia completa `0001`-`0011`
  aplicada do zero + reaplicação confirmando idempotência (mesmo teste
  do job `schema-check` do CI).
- **Correção pontual**: 2 comentários CSS em `src/styles.css` (linhas 53,
  63, 67, 70 -- descrição da paleta de cores), nunca cobertos por nenhuma
  etapa anterior. Achado numa varredura final que expôs uma lacuna
  metodológica: as varreduras de conferência anteriores buscavam só
  caracteres acentuados; "azul executivo" (linha 67, sem acento) só
  apareceu numa segunda passada com lista de palavras comuns em
  português sem acento.

## Fase 4: strings de descrição de teste (`it`/`describe`)

Categoria explicitamente deixada de fora do escopo original ("nomenclatura",
não descrições de teste), mas dentro da regra mais ampla de idioma técnico
registrada em `AGENTS.md`. Iniciada por pedido do usuário em 2026-08-06,
mesmo padrão de etapas incrementais da Fase 3: um PR por etapa, só a string
do primeiro argumento de `it(...)`/`describe(...)`, nenhuma mudança de
comportamento (são só rótulos do reporter do Vitest).

- **Etapa 11** (concluída, PR #219): os 8 arquivos de teste com maior
  volume de descrição em português (`auth-api.test.ts`,
  `xlsx-parser.test.ts`, `auth-middleware.test.ts`, `filter-cascade.test.ts`,
  `rate-limit.test.ts`, `pdf-download-store.test.ts`,
  `dashboard.functions.test.ts`, `admin-users.functions.test.ts`).
- **Etapa 12** (concluída, PR #220): os 25 arquivos de teste restantes
  com descrição em português (`retention.test.ts`,
  `area.functions.test.ts`, `admin-user-management.test.tsx`,
  `rate-limit.middleware.test.ts`, `utils.test.ts`, `staging-row.test.ts`,
  `date-window.test.ts`, `csp.test.ts`, `boot-guards.test.ts`,
  `audit-tooltip.test.ts`, `upload.functions.test.ts`, `schemas.test.ts`,
  `product.functions.test.ts`, `export-pdf.test.ts`, `admin-utils.test.ts`,
  `admin-system.functions.test.ts`, `admin-docs.functions.test.ts`,
  `use-wake-lock.test.ts`, `admin-audit-panel.test.tsx`,
  `turnstile.test.ts`, e os 4 arquivos `*.guards.test.ts`).
  **A tradução de descrições de teste em português está completa em
  todo o projeto.**

Nomes próprios de tela (ex.: "Área", "Documentação", "Administração") são
mantidos como estão em qualquer etapa, mesmo dentro de comentários --
critério fixado na etapa 1.

Strings de descrição de teste (`it("...")`, `describe("...")`) em português,
encontradas durante a auditoria mas fora do escopo original do pedido (fala
de "nomenclatura", não de descrições de teste), viraram a Fase 4 abaixo por
pedido explícito do usuário em 2026-08-06, e estão concluídas (etapas 11-12).

## Verificação (quando a Fase 2 for executada)

- `bun run lint` / `bun run typecheck` / `bun run test`
- Rodar as 8 migrations + baseline do zero num banco local (mesmo que o
  `schema-check` do CI faz) para provar idempotência antes de mergear
- Validação em navegador real (Puppeteer): login por matrícula/employee_id,
  tela de Área com os filtros de hierarquia, dashboard com rankings
- Checar Sentry por erro novo após o deploy de cada PR desta sequência
