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
- **Restante, não iniciado**: ~21 arquivos não-teste de `src/lib/`, ~28 em
  `src/components/`, ~14 em `src/routes/`, ~17 em `scripts/` (exceto as 5
  migrations já aplicadas, imutáveis por design), ~38 arquivos de teste
  (categoria própria, tratamento a definir).

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
