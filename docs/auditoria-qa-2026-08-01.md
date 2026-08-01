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

1. ⬜ **Corrigir o open redirect em `sanitizeNext`** (+ extrair a duplicação
   `auth.tsx`/`auth.page.tsx` pra um único helper testado) — **crítico**,
   esforço baixo (1 função pequena, 2 pontos de uso, fix é uma linha).
2. ⬜ **Corrigir `vitest.config.ts` pra incluir `.tsx`** (`test.include` e
   `coverage.include`) — **crítico** (bloqueia toda a frente de teste de
   componente), esforço trivial (mudança de 2 globs), mas exige checar que
   nenhum `.tsx` existente quebra o coverage threshold ao entrar de
   surpresa em 0%.
3. ⬜ **Teste de rejeição real para `assertAdmin`/`requireAuth`** (ao menos
   1 função por arquivo, sem mockar os guards) — **alto**, esforço médio;
   é o gap de IDOR mais concreto: hoje nenhum teste prova que um não-admin
   é de fato barrado.
4. ⬜ **Teste de `rate-limit.middleware.ts`** (`requireRateLimit()`) — hoje
   0% e mockado como no-op em todo lugar — **alto**, esforço médio; é o
   ponto de aplicação real do rate limit em toda função não-auth.
5. ⬜ **Teste da atribuição de hierarquia no parser XLSX** (depto/seção/
   grupo/subgrupo populados de verdade, não só o caminho nulo) — **alto**,
   esforço baixo (ajustar fixtures existentes pra realmente disparar os 4
   branches); categorização de produto rodando sem prova de que categoriza
   certo é o maior risco silencioso desta auditoria.
6. ⬜ **Guard de `TURNSTILE_BYPASS` em produção** (falha no boot se
   `NODE_ENV=production && TURNSTILE_BYPASS=true`) + teste — **alto**,
   esforço trivial; hoje é um interruptor sem trava que desliga o CAPTCHA
   inteiro se vazar numa config errada.
7. ⬜ **Teste de arquivo corrompido/zero-linhas no parser XLSX**, incluindo
   fechar o gap do `scripts/import.ts` (sem guard de `total_rows===0`, hoje
   estoura erro cru de banco) — **médio**, esforço baixo.
8. ⬜ **Teste de reconciliação de contagem** (linhas no arquivo vs.
   inseridas vs. `finalize_import.p_row_count`) — **médio**, esforço médio;
   decide também se vale adicionar a checagem que falta na procedure.
9. ⬜ **1 teste de componente real** (`render()`, não `renderHook`) para
   validar que o item 2 realmente desbloqueou a frente — sugestão:
   `admin-user-management.tsx` (maior superfície + já alimenta um path sem
   teste) — **médio**, esforço médio; primeiro caso serve de modelo para os
   demais 16 componentes listados em A.1.
10. ⬜ **Teste de aplicação limpa do schema contra MariaDB real** (CI ou
    local — `migrate-schema.sql` + `scripts/migrations/*.sql` em sequência
    a partir de banco vazio) — **médio**, esforço alto (exige banco de
    teste no CI, ex. serviço MySQL do GitHub Actions); é o único item desta
    lista que muda a infraestrutura de CI, não só o código de teste.
11. ⬜ **Teste de idempotência de `run-migrations.sh`** (rodar 2x, confirmar
    no-op na segunda) — **baixo**, esforço médio, depende do item 10.
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
