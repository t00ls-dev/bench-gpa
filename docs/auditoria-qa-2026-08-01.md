# Auditoria de QA e Cobertura de Testes — bench-gpa (01/08/2026)

Auditoria focada exclusivamente em **testabilidade e cobertura real de
comportamento**, não em qualidade geral de código (isso já foi coberto em
`docs/auditoria-tecnica-2026-07-31.md`, 31/07 — não repetido aqui) nem em
infraestrutura de VPS (`docs/analise-servidor-producao-2026-07-31.md`, 31/07
— idem). Conduzida via 3 investigações paralelas: (A) mapa de
arquitetura/hooks/componentes vs. cobertura existente, (B) segurança —
delta de cobertura de teste sobre o que a auditoria de 31/07 já documentou,
(C) importação XLSX + integridade de banco de dados. Cobertura de linhas no
momento da auditoria: **82,5%** (`docs/coverage-summary.md`).

O objetivo desta auditoria não é subir o percentual — é confirmar que o
comportamento de negócio real está protegido por teste, e não só que o
contador de linhas executadas está alto. Boa parte dos achados abaixo prova
exatamente essa distinção: código com 100% de cobertura de linha cujo
comportamento crítico nunca é realmente exercitado (ex.: guard de admin
mockado como no-op em todo teste, branch de categorização do XLSX que nunca
dispara).

---

## Achado crítico — vulnerabilidade real, não só lacuna de teste

**Open redirect em `sanitizeNext` (bypass de barra invertida).** A função é
duplicada de forma idêntica em `src/routes/auth.tsx:4-8` e
`src/routes/auth.page.tsx:24-28`:

```js
function sanitizeNext(next) {
  if (typeof next !== "string") return "/";
  if (!next.startsWith("/") || next.startsWith("//")) return "/";
  return next;
}
```

Um valor como `/auth?next=/\evil.com` passa nas duas checagens
(`startsWith("/")` true, `startsWith("//")` false), mas o parser de URL do
WHATWG normaliza `\` para `/` em esquemas especiais — confirmado
diretamente:

```
node -e 'console.log(new URL("/\\evil.com", "https://example.com").href)'
→ https://evil.com/
```

Isso vale tanto para `new URL(target, window.location.origin)`
(`auth.tsx:24-26`) quanto para `window.location.href = target`
(`auth.page.tsx:42-43`). Um atacante que induza a vítima a clicar num link
de login legítimo com esse parâmetro consegue redirecioná-la para fora do
domínio logo após a autenticação. **Sem teste hoje, sem defesa no código
hoje.** Corrigir independe de qualquer decisão sobre o resto desta
auditoria — é um bug de segurança verificado, não uma hipótese.

**Correção sugerida**: rejeitar qualquer `next` que contenha `\`, ou trocar
a checagem por `new URL(next, origin).origin === origin` antes de confiar
no valor. Aproveitar para extrair a função duplicada para um único local
testável (resolve também a duplicação, já sinalizada como achado menor).

---

## A. Arquitetura de testes e cobertura por camada

### A.1 — Bloqueio estrutural: `.test.tsx` nunca roda

`vitest.config.ts` define `test.include: ["src/**/*.test.ts"]` e
`coverage.include: ["src/**/*.ts"]` — **nenhum dos dois padrões casa com
`.tsx`**. Não existe um único `*.test.tsx` no repositório hoje, e mesmo que
alguém escrevesse um teste de componente real com `render()` do
`@testing-library/react` num arquivo `.test.tsx`, o Vitest simplesmente
nunca o executaria — sem erro, sem aviso, silenciosamente ignorado, e sem
aparecer nem a 0% no relatório de cobertura.

Isso explica por que **zero componentes React têm teste hoje**: os únicos 3
arquivos que importam `@testing-library/react` usam só `renderHook` (testam
hooks isolados, nunca um componente montado). Esse é o pré-requisito técnico
para qualquer item da seção "React"/"Formulários" do pedido original — sem
mexer nesse glob primeiro, nada nessa frente é possível.

**Componentes com lógica não-trivial e zero teste**, por complexidade
(hooks internos): `admin-user-management.tsx` (9), `multi-select.tsx` (12),
`area-table.tsx` (2, mas virtualizado + PDF), `admin-audit-panel.tsx` (2),
`filter-bar.tsx` (3), `date-range-picker.tsx` (6), `command-palette.tsx`
(8), entre outros 9 componentes menores. Maior risco de negócio:
`admin-user-management.tsx` (alimenta o path não testado de `listUsers`,
ver A.2) e `multi-select.tsx`/`filter-bar.tsx` (cascata de filtro
compartilhada por Dashboard/Área/Produto).

### A.2 — Funções de servidor e hooks: lacunas pontuais

| Item                                                                                                         | Situação                                                                                                                                                           |
| ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `version.functions.ts` (`getBuildInfo`)                                                                      | Zero teste — trivial, mas 0%                                                                                                                                       |
| `admin-users.functions.ts` → `listUsers`                                                                     | Zero teste (as outras 4 exportações têm)                                                                                                                           |
| `setUserActive`                                                                                              | Guard de auto-lockout testado só em `setUserRole`, não replicado aqui                                                                                              |
| `use-elapsed-seconds.ts`, `use-mobile.tsx`, `use-reset-on-change.ts`, `use-theme.ts`, `use-version-check.ts` | Sem teste dedicado — alguns aparecem "100%" no relatório só por cobertura incidental (chamados de dentro de outro hook testado), não por caso de borda intencional |
| `use-persistent-state.ts`                                                                                    | Mesma situação — sem teste de quota de localStorage cheia, falha do `sanitize`, ou leitura cross-aba                                                               |

### A.3 — Dead code / TODOs

Zero markers reais de TODO/FIXME/XXX no repositório (as únicas ocorrências
de "TODO" são a palavra portuguesa "todos"/"todo" = "all"/"every"). Nenhum
export órfão novo desde a limpeza de 31/07 — a varredura desta auditoria não
achou nada além do que já foi resolvido.

---

## B. Segurança — cobertura de teste (delta sobre 31/07)

Rate limiting (IP+conta), CSP/HSTS, bypass de origem via IP direto e
fail2ban já estão documentados e **não são repetidos aqui** — o foco é: essa
lógica de segurança é exercitada por teste automatizado, ou só existe no
código?

| #   | Item                                                               | Veredito                             | Nota                                                                                                                                                                                                                                                                   |
| --- | ------------------------------------------------------------------ | ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | JWT (expirado/adulterado/role errada/`token_version`)              | Testado (parcial)                    | Bem coberto, mas todo teste mocka `jwt.verify` — nada exercita a lib real ponta a ponta                                                                                                                                                                                |
| 2   | Guards de admin (`assertAdmin`/`requireAuth`) realmente bloqueando | **Não testado**                      | Em **todos** os `*.functions.test.ts`, os dois guards são mockados como no-op; todo teste só confirma que foram _chamados_, nunca que _rejeitam_. Um refactor que remova `assertAdmin` de um handler passaria em 100% dos testes existentes                            |
| 3   | Rate limiting — instâncias de produção e o middleware em si        | **Não testado**                      | `rate-limit.middleware.ts` (o ponto de aplicação real em toda função não-auth) está em 0% e é mockado como no-op em todo teste; as instâncias `authLimiter`/`apiLimiter`/etc. nunca são exercitadas com seus limiares reais, só um `RateLimiter` genérico recém-criado |
| 4   | SQL Injection                                                      | **Confirmado seguro**                | 100% dos ~63 `db.query(` usam placeholders `?`/`??`; os dois `??` (nome de tabela/coluna) são restritos a union type TS, não input livre                                                                                                                               |
| 5   | XSS                                                                | N/A por design                       | Sem `dangerouslySetInnerHTML`/`innerHTML=` em lugar nenhum; `react-markdown` renderiza só conteúdo do próprio repo (`docs/*.md`, build-time), não input de usuário                                                                                                     |
| 6   | CSRF                                                               | N/A por design, parcialmente testado | Proteção é `SameSite=lax` + server functions só-POST; o atributo `sameSite` é testado, `secure` nunca é asserted                                                                                                                                                       |
| 7   | Senha/credencial                                                   | Testado (majoritariamente)           | `bcrypt` cost 12 testado (mockado); revogação de sessão no reset de senha bem coberta ponta a ponta                                                                                                                                                                    |
| 8   | `TURNSTILE_BYPASS` em produção                                     | **Sem defesa nenhuma**               | Nenhum código impede `TURNSTILE_BYPASS=true` de chegar em produção — é passthrough direto de env var, sem validação contra `NODE_ENV`, e sem teste cobrindo isso                                                                                                       |
| 9   | Open redirect (`sanitizeNext`)                                     | **Vulnerável**                       | Ver "Achado crítico" acima                                                                                                                                                                                                                                             |

---

## C. Importação XLSX

### C.1 — O que é validado hoje, e o que não é

O parser (`xlsx-parser.ts`) tem 15 regras distintas de validação/
normalização (marcador de data, split código-nome, dedup por PLU, coerção
numérica pt-BR, etc.). O bloco de `parseCellNumber` é testado de forma
exaustiva (11 cenários — moeda, milhar, decimal ambíguo, NaN/Infinity). Mas
o resto tem lacunas concretas:

- **A atribuição de hierarquia (depto/seção/grupo/subgrupo) nunca dispara
  nos testes existentes** — todas as linhas "Total" das fixtures de teste
  estão posicionadas de um jeito que nunca ativa os 4 branches de
  atribuição real; só o caminho "sem hierarquia nenhuma" é coberto. Ou seja:
  **a categorização de produto, uma das funções centrais do sistema, roda
  hoje sem nenhum teste provando que atribui o depto/seção certo.**
- Linha de "Total do Depto" no fixture de teste está posicionada antes do
  loop começar (`r=2`) — nunca é avaliada pelo parser real.
- Célula com valor `0` explícito é indistinguível de célula vazia/inválida
  no output (linha 13 da tabela completa no relatório dos agentes) — não
  testado, comportamento pode ser intencional mas não está documentado como
  tal.
- Não coberto: arquivo vazio, arquivo corrompido/binário inválido, múltiplas
  planilhas (só a primeira é lida — sem teste, sem aviso ao usuário se a
  segunda planilha tiver dados), cabeçalho ausente, colunas fora de ordem,
  datas em formato serial do Excel, linhas duplicadas, unicode/emoji,
  fórmulas em célula, `.xls` binário legado (apesar do dropzone aceitar a
  extensão).
- **Sem reconciliação de contagem**: nenhum teste compara linhas-no-arquivo
  vs. linhas-inseridas vs. linhas-rejeitadas. A procedure `finalize_import`
  grava `p_row_count` como recebido, sem cruzar contra a contagem real
  agregada — um cliente que envie um número errado (chunk perdido) teria
  isso persistido e exibido sem detecção.
- **Arquivo corrompido**: hoje lança erro (da própria lib SheetJS, mensagem
  não amigável), não trava nem retorna lixo silenciosamente — comportamento
  correto, mas nunca verificado por teste.
- **Arquivo com zero linhas de produto** (marcador presente, sem produtos):
  o parser retorna `sales: []` sem lançar erro — só é barrado no caminho web
  (`beginImport`'s `total_rows===0`). O `scripts/import.ts` (CLI) **não tem
  esse guard**, e deixaria a procedure `finalize_import` estourar
  `SQLSTATE '45000'` como erro de banco cru, não uma mensagem amigável.

## D. Integridade de banco de dados

- Sem foreign keys — decisão deliberada e já documentada (custo de
  verificação linha-a-linha em rewrites em massa), não repetida aqui.
- **100% da cobertura de banco é via `db.query` mockado.** Nenhum teste roda
  contra uma MariaDB real (nem testcontainer) — nada prova hoje que
  `migrate-schema.sql` aplica limpo do zero, que as constraints `UNIQUE`
  realmente rejeitam duplicata, ou que o rollback transacional de
  `finalize_import` de fato desfaz uma inserção parcial em caso de erro.
  Isso é validado hoje só manualmente (`scripts/validate-procs.sh`/
  `bench-procs.sh` contra produção ou um banco local mantido à mão).
- Idempotência das migrations versionadas depende inteiramente da tabela
  `schema_migrations` (criada ad hoc pelo runner, fora do
  `migrate-schema.sql`) — `0003_token_version.sql` documenta explicitamente
  que não é idempotente por si só (MariaDB não tem `ADD COLUMN IF NOT
EXISTS`) e conta só com esse guard. Nunca testado — só confiança na
  disciplina do pipeline de deploy.

---

## Ações priorizadas

Classificação por impacto (Crítico/Alto/Médio/Baixo) e esforço, na ordem
recomendada de execução. Nenhuma foi iniciada — aguardando decisão sobre
quais entram em execução e em que ordem.

1. ✅ 01/08 — **Corrigir o open redirect em `sanitizeNext`** — extraído
   pra `src/lib/sanitize-next.ts`, agora comparando `.origin` resolvido
   pelo parser em vez de prefixo de string (fecha também um segundo
   bypass da mesma classe, via tab/newline). 10 testes — **crítico**,
   esforço baixo.
2. ✅ 01/08 — **Corrigir `vitest.config.ts` pra incluir `.tsx`**
   (`test.include`/`coverage.include`) — feito junto com o item 9 (a
   validação do próprio item). O denominador de cobertura praticamente
   dobrou (117 arquivos fonte contra ~49 antes), então os pisos de
   `scripts/coverage-thresholds.ts` foram recalibrados (40/40/30/25 →
   20/20/15/12) — não é regressão real, é o relatório passando a contar
   `.tsx` honestamente pela primeira vez. Também faltava
   `@testing-library/jest-dom` conectado (nenhum `.test.tsx` existia até
   agora pra precisar): criado `vitest.setup.ts` (`setupFiles` +
   `afterEach(cleanup)` global) — **crítico**, esforço baixo.
3. ✅ 01/08 — **Teste de rejeição real para `assertAdmin`** (1 função por
   arquivo — `diagnoseData`, `listDocs`, `listUsers`, `beginImport` —, sem
   mockar o guard) — **alto**, esforço médio. 4 arquivos novos
   (`*.guards.test.ts`), cada um prova que um não-admin é rejeitado _e_ que
   nenhuma consulta de negócio roda antes disso (só a checagem `CALL
has_role` acontece). Sanidade verificada manualmente: forçar
   `has_role: 1` faz o teste falhar, confirmando que a asserção é real, não
   tautológica. Escopo consciente: `requireAuth` ficou de fora — sua lógica
   de rejeição (JWT expirado/adulterado, `token_version`, usuário inativo)
   já é extensivamente testada em `auth-middleware.test.ts` (11 casos);
   repetir isso 4x nesses arquivos seria esforço alto por sinal baixo,
   dado que a montagem de JWT/cookie mockados não muda entre eles.
4. ✅ 01/08 — **Teste de `rate-limit.middleware.ts`** (`requireRateLimit()`)
   — `rate-limit.middleware.test.ts` (7 casos) usa os singletons reais de
   produção (`apiLimiter`/`uploadLimiter`, via `vi.resetModules()` +
   import dinâmico pra isolar o orçamento global entre testes) e prova:
   libera dentro do teto e propaga `next()`; bloqueia exatamente na 301ª
   (api, 300/min) e na 201ª (upload, 200/min) requisição do mesmo IP;
   tier default é "api"; orçamento é isolado por IP e por tier; resolve o
   IP via `getClientIp` mesmo sem nenhum header — **alto**, esforço médio.
   Sanidade confirmada manualmente (baixar o contador do loop em 1 faz o
   teste falhar).
5. ✅ 01/08 — **Teste da atribuição de hierarquia no parser XLSX** — 3
   testes novos em `xlsx-parser.test.ts`: os 4 branches (depto/seção/
   grupo/subgrupo) disparando de verdade com o rótulo "Total" exatamente
   adjacente (o teste antigo só provava que rótulos por extenso, tipo
   "Total do Depto", são ignorados sem crashar — nunca disparava os
   branches reais); reset de seção/grupo/subgrupo ao entrar num novo
   depto; reset só de grupo/subgrupo ao entrar numa nova seção, mantendo o
   depto — **alto**, esforço baixo. Sanidade confirmada manualmente
   (zerar a atribuição de depto no código faz os 3 testes falharem).
6. ✅ 01/08 — **Guard de `TURNSTILE_BYPASS` em produção** — nova função
   pura `assertSafeBoot()` em `src/lib/boot-guards.ts`, chamada uma vez no
   topo de `src/server.ts` (o entrypoint real do servidor, `server: {
entry: "server" }` do `vite.config.ts`): lança se
   `NODE_ENV=production && TURNSTILE_BYPASS=true`, o que impede o
   processo de sequer subir (PM2 veria falha de boot, não um servidor
   rodando silenciosamente com o CAPTCHA desligado). 5 testes cobrindo o
   caso real e os "quase-sim" (dev/test com bypass ligado — legítimo;
   valor não exatamente `"true"`) — **alto**, esforço trivial. Sanidade
   confirmada manualmente. Escopo consciente: o flag de build
   `VITE_TURNSTILE_BYPASS` (cliente, só esconde o widget) ficou de fora —
   quem decide se o token é exigido de verdade é sempre o servidor.
7. ✅ 01/08 — **Teste de arquivo corrompido/zero-linhas no parser XLSX** — 2
   testes novos: buffer não-xlsx lança erro (não trava, não devolve lixo);
   arquivo válido com marcador de data mas zero produtos devolve listas
   vazias sem lançar (comportamento correto — quem decide se é erro de
   negócio é o chamador). Fechado também o gap real do `scripts/import.ts`
   apontado pelo item: guard de `totalRows===0` adicionado, mesma mensagem
   de `upload.functions.ts:beginImport` — antes disso, o CLI seguia até
   `finalize_import` e estourava `SIGNAL SQLSTATE '45000'` cru — **médio**,
   esforço baixo.
8. ✅ 01/08 — **Reconciliação de contagem** — decisão: valia, e foi corrigido
   na procedure, não só testado. `p_row_count` (`migrate-schema.sql:
finalize_import`) era o que o CLIENTE afirmava (`parsed.sales.length`,
   calculado ANTES de qualquer chunk ser de fato inserido) — nunca cruzado
   contra o que realmente chegou no staging. Fix de 1 linha:
   `import_log.row_count` agora grava `v_staging_count` (a contagem real,
   já verificada `> 0` duas linhas acima na mesma procedure) em vez de
   `p_row_count`. Escopo consciente: fica no `migrate-schema.sql` (não
   virou migration versionada — mudança de procedure re-sincroniza sozinha
   a cada deploy, convenção documentada em
   `scripts/migrations/README.md`); a assinatura da procedure manteve
   `p_row_count` pra não mexer nos dois pontos de chamada
   (`upload.functions.ts`, `scripts/import.ts`), agora só informativo.
   **Validado manualmente contra MariaDB real** (schema aplicado do zero
   num banco local): `CALL finalize_import('batch-teste', '2026-08-01',
999, NULL)` com só 3 linhas reais na staging gravou `row_count = 3` em
   `import_log`, não 999 — confirma o fix. Agregações (`sales_daily_agg`/
   `sales_prod_daily_agg`) e limpeza do staging conferidas na mesma
   passada. Comentário adicionado em `upload.functions.test.ts` apontando
   pra essa validação, já que `db.query` mockado não executa SQL de
   verdade — **médio**, esforço médio.
9. ✅ 01/08 — **1 teste de componente real** — `admin-user-management.test.tsx`
   (7 testes, `render()`+`fireEvent`, não `renderHook`): skeleton de
   carregamento, lista vazia, renderização de email/nome/papel/status,
   busca por email/nome, paginação (25/página, botões prev/next, contagem
   de página), e os dois fluxos de confirmação-então-mutação (promover a
   admin chama `setUserRole` e invalida `["admin-users"]`; inativar chama
   `setUserActive`) — provando que o item 2 desbloqueou a frente de
   verdade, com interação real, não só render estático. `CreateUserDialog`/
   `ResetPasswordDialog` mockados como stub (escopo do próprio arquivo) —
   **médio**, esforço médio. Serve de modelo para os demais 16 componentes
   listados em A.1.
10. ✅ 01/08 — **Teste de aplicação limpa do schema contra MariaDB real** —
    novo job `schema-check` em `.github/workflows/ci.yml`, serviço
    `mariadb:11.4` (a mesma versão de produção), aplica `migrate-schema.sql`
    - `scripts/migrations/*.sql` num banco vazio via `scripts/run-migrations.sh`
      de verdade (o mesmo script do deploy). `deploy` agora depende também
      deste job (`needs: [ci, schema-check]`), não só de `ci` — **médio**,
      esforço alto (única mudança de infraestrutura de CI desta lista).

    **Achou 2 bugs reais na primeira execução** — instalação nova sempre
    esteve quebrada, só nunca foi notado porque todo ambiente existente já
    tinha rodado as migrations antes de a baseline mudar:
    - `0002_remove_medidas_sem_fonte.sql`: `DROP COLUMN` sem `IF EXISTS`
      falhava porque `migrate-schema.sql` já não cria essas colunas.
    - `0003_token_version.sql`: `ADD COLUMN` sem `IF NOT EXISTS` falhava
      porque `migrate-schema.sql` já cria `users.token_version` — duplicata.

    Ambas corrigidas com `IF EXISTS`/`IF NOT EXISTS` nativos do MariaDB
    (comentários antigos diziam que essa sintaxe não existia — errado, é
    uma extensão do MariaDB desde a série 10.x, ausente só no MySQL vanilla
    até 8.0.29; confirmado direto contra MariaDB 11.8 local). Editar uma
    migration já aplicada normalmente é proibido
    (`scripts/migrations/README.md`, forward-only) — seguro aqui porque o
    runner identifica migrations concluídas pelo NOME DO ARQUIVO em
    `schema_migrations`, nunca reexecuta conteúdo; produção não é afetada,
    só instalação nova passa a funcionar. Validado manualmente contra
    MariaDB real antes de subir pro CI (banco vazio → aplica limpo; rodado
    de novo → no-op).

11. ✅ 01/08 — **Teste de idempotência de `run-migrations.sh`** — coberto
    pelo mesmo job `schema-check`: roda o script 2x seguidas contra o mesmo
    banco e falha se a segunda vez não reportar "nenhuma migration nova"
    (`grep` na saída) — **baixo**, esforço médio, feito junto do item 10
    por já estar rodando o mesmo banco/schema.
12. ⬜ **Testes de edge case adicionais do parser XLSX** (múltiplas
    planilhas, unicode/emoji, datas em formato serial, `.xls` legado,
    linhas duplicadas) — **baixo**, esforço baixo cada, mas em conjunto é
    esforço médio-alto; nenhum desses cenários tem evidência de já ter
    causado um bug real em produção, ao contrário dos itens 5 e 8.

Itens **não** incluídos nesta lista por decisão consciente: testes de
constraint/rollback transacional contra banco real (dependem do item 10 já
existir), suíte E2E completa com Playwright/Cypress (o prompt original pede
login/logout/navegação simulando usuário real — hoje isso é feito
manualmente via Puppeteer ad hoc, conforme convenção do projeto; criar uma
suíte E2E de verdade é uma decisão de ferramenta nova, não um item de
"adicionar teste", e merece decisão própria antes de entrar nesta lista),
testes de performance automatizados (já cobertos por medição manual em
`docs/medicao-performance.md`, formalizar como suíte é outro projeto à
parte), e testes de acessibilidade (nenhuma ferramenta de a11y — axe-core ou
similar — está instalada; adicionar uma é pré-requisito, não item isolado).
