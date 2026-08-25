# Refatoração de autenticação: e-mail -> username + matrícula

## Contexto

O Bench GPA autentica hoje por e-mail sintético `usuario@gpabr.com` (domínio
fixo, hardcoded via regex em `EmailSchema`), sem nenhum fluxo de primeiro
acesso, sem expiração de senha, sem troca de senha pelo próprio usuário, e sem
"esqueci minha senha" (nunca existiu — documentado como pendência nunca
implementada em `docs/continuar.md`, e não há infraestrutura de envio de
e-mail em lugar nenhum do projeto). O pedido é abandonar e-mail por completo e
adotar um modelo corporativo: login por username OU matrícula, conta criada
pelo admin sem senha, primeiro acesso obrigatório definindo a senha, expiração
de senha a cada 30 dias, e reset de senha só por admin.

Investigação prévia (3 agentes de exploração + 1 agente de design, todos lendo
o código real, não documentação) mapeou o sistema atual por completo e
encontrou 6 furos de arquitetura que o desenho ingênuo teria (detalhados
abaixo, já corrigidos no plano). O mais grave: um endpoint de "definir senha
inicial" desprotegido seria uma superfície de account takeover, porque
username+matrícula têm baixa entropia (matrícula costuma ser sequencial) e o
endpoint não pode confiar em senha nenhuma para provar identidade.

Achado do usuário que muda a lógica de migração: a parte local do e-mail
(antes de `@gpabr.com`) hoje já É o dado novo, só falta classificar qual:
- Só dígitos -> já é a **matrícula** (falta username).
- Qualquer caractere não numérico -> já é o **username** (falta matrícula).

## Arquitetura

### Schema (`users`)

```sql
username         VARCHAR(60)  NULL UNIQUE   -- nullable só para acomodar legados
matricula        VARCHAR(30)  NULL UNIQUE   -- pendentes de admin completar
password         VARCHAR(255) NULL          -- NULL = conta sem senha definida
password_changed_at TIMESTAMP NULL DEFAULT NULL
-- email removido (PR 3, após confirmar estabilidade em produção)
```

`UNIQUE` sobre coluna nullable é seguro em MariaDB (múltiplos `NULL` não
colidem). Cadastro de usuário **novo** pelo admin exige os dois campos via
Zod (não via `NOT NULL` do banco, para não quebrar os legados migrados com
só um dos dois).

`audit_log.actor_email` (única coluna real de e-mail em auditoria —
`target_email` **não é coluna**, é derivada por `LEFT JOIN users` em
`admin-system.functions.ts:152-155`, confirmado lendo o código) vira
`actor_username`.

### Estado de senha — máquina de 3 estados, calculada sempre a partir do banco

- `password IS NULL` -> **precisa definir senha** (cobre primeiro acesso de
  conta nova E reset feito por admin — admin reseta = zera `password` e
  `password_changed_at` de novo, reusando o mesmo fluxo em vez de inventar um
  segundo mecanismo).
- `password IS NOT NULL AND (password_changed_at IS NULL OR password_changed_at < NOW() - INTERVAL 30 DAY)`
  -> **senha expirada**, precisa trocar antes de continuar (usuário já provou
  identidade com a senha atual no login).
  IMPORTANTE: tratar `password_changed_at IS NULL` como "precisa trocar"
  (fail-safe), não como "nunca expira" (fail-open) — em SQL, qualquer
  comparação com `NULL` é `NULL`/falsy, então sem esse `OR` explícito todo
  usuário migrado no PR 1 (senha real, mas `password_changed_at` recém-criado
  como `NULL`) ficaria isento de expirar para sempre.
- Caso contrário -> acesso normal.

Login aceita um único campo `identifier` (username OU matrícula), resolvido
via `WHERE username = ? OR matricula = ?`. Para essa consulta nunca ser
ambígua, `UsernameSchema` proíbe string puramente numérica
(`/^(?!\d+$)[a-z0-9._-]+$/`) e `MatriculaSchema` exige só dígitos
(`/^\d+$/`, sem cast pra número — preserva zero à esquerda). É exatamente a
mesma regra já confirmada para a migração, virando também uma restrição de
schema.

### Duas funções de senha, deliberadamente distintas (não é "variação para o mesmo resultado" — são duas provas de identidade genuinamente diferentes)

**`setInitialPassword({username, matricula, newPassword, confirmPassword})`**
— usada quando `password IS NULL`, sem sessão. Como não há senha para
conferir, exige username **E** matrícula juntos (`AND`, não `OR`) como prova
de identidade. Protegida pelas mesmas 3 camadas que `login` já tem hoje —
**isto é bloqueante, não polimento**: `authLimiter` por IP, rate limit por
conta (chave = `id` resolvido, não a string digitada), Turnstile fail-closed.
Sem isso é a superfície mais fraca do sistema novo. Sucesso: hash da senha,
`password_changed_at = NOW()`, auto-login (`issueSession`) — evita duas
viagens sem ganho de segurança real.

**`changePassword({currentPassword, newPassword, confirmPassword})`** —
autenticada, exige a senha atual (`bcrypt.compare`). Serve tanto para troca
voluntária quanto para o fluxo forçado por expiração (usuário já autenticou
com a senha, só precisa confirmá-la de novo). Usa rate limit tier `auth` (não
o tier genérico de API) porque `bcrypt.compare` custa CPU real numa VPS de 1
núcleo (mesma razão documentada em `auth-config.ts` para não subir
`BCRYPT_COST`). **Detalhe que quebraria o fluxo se esquecido**: incrementa
`token_version` (para derrubar outras sessões, mesmo comportamento do reset
por admin hoje) mas precisa **reemitir a sessão do próprio request** com o
`tokenVersion` novo antes de retornar — senão a aba que acabou de trocar a
senha se autodestrói na chamada seguinte (`"Unauthorized: session revoked"`),
e no fluxo forçado por expiração isso vira um loop: troca a senha pra sair do
gate, é deslogado, loga de novo, cai no gate de novo.

### Gate central único, não checagem espalhada por server function

`resolveSession` já releê `role`/`is_active` do banco a cada chamada (nunca
confia no JWT para isso) — o SELECT cresce para trazer também `username`,
`matricula`, `password IS NULL` e `password_changed_at`, computando
`passwordChangeRequired: boolean` em SQL. **`resolveSession` não lança por
causa disso** — só devolve o campo. Motivo: o `catch` existente em
`auth-middleware.ts` (linhas 47-60) embrulha qualquer erro que não comece com
`"Unauthorized"` numa mensagem genérica `"Unauthorized: invalid token"` —
lançar `"PasswordChangeRequired"` de dentro do `try` faria esse catch destruir
a distinção. A checagem de `passwordChangeRequired` entra **depois** do
try/catch existente, como um throw separado, para não ser embrulhada.
`changePassword` usa uma segunda variante do middleware
(`requireAuthAllowExpiredPassword`) que roda o mesmo corpo sem essa checagem
final — senão a própria função que resolve o problema fica bloqueada por ele.

`getMe` devolve o mesmo campo (nunca lança por causa dele, `slide:false`
inalterado) — o client já chama `getMe()` em toda navegação via
`_authenticated/route.tsx`, então esse é o ponto único de detecção no
frontend, sem inventar mecanismo novo.

Consequência simplificadora: **`username` não precisa ir para o payload do
JWT** (diferente de como `email` funciona hoje, congelado no payload). Como o
SELECT já vai crescer de qualquer forma, `username` vem junto, buscado por
`id` (único campo estável do payload). Isso elimina de vez a classe de bug
"campo congelado desatualiza" (hoje existe para `email`) em vez de replicá-la
— e também significa que tokens JWT emitidos **antes** deste deploy continuam
validando normalmente sem nenhum tratamento de versão: eles não têm
`username` no payload, mas ninguém nunca vai ler `username` do payload.

### Rate limit por conta: chave por `id` resolvido, não pela string digitada

Evita dois problemas: (1) alternar entre login por username e por matrícula
da mesma conta para resetar o balde do rate limiter; (2) se um dia o admin
editar o username de alguém, chavear pela string quebraria a continuidade do
balde — `id` nunca muda. Isso reordena `login`: resolver o identificador
contra o banco **antes** de checar o rate limit de conta (hoje é o
contrário). Se a conta não for encontrada, cai para `identifier:<bruto>` como
chave (mantém a mesma cobertura contra brute-force de conta inexistente).

### Sentry

`setUser({..., email})` nos dois pontos (`auth-middleware.ts` server,
`_authenticated/route.tsx` client) troca para `username`. Corte de
continuidade aceitável nos agrupamentos históricos do Sentry, não é bug.

## Sequenciamento (3 PRs — deploy direto pra produção, sem staging, é o único mecanismo de auth do sistema)

**PR 1 — schema + migração de dados (aditiva, não quebra nada ainda; `email` continua em uso)**
- `scripts/migrate-schema.sql`: novas colunas (`username`, `matricula` NULL
  UNIQUE; `password` passa a NULL; `password_changed_at`). A definição de
  `audit_log` no baseline já nasce com `actor_username` (só afeta instalação
  nova — ver correção abaixo sobre por que o rename em si só roda no PR 2).
- `scripts/migrations/0006_users_username_matricula.sql`: `ALTER TABLE`
  idempotente (`ADD COLUMN IF NOT EXISTS`) + backfill
  `UPDATE users SET password_changed_at = NOW() WHERE password IS NOT NULL AND password_changed_at IS NULL`
  (dá 30 dias cheios de folga a partir do rollout em vez de forçar troca em
  massa no primeiro login pós-deploy — sinalizando como default proposto,
  não decisão fechada: se preferir forçar todo mundo a trocar a senha já no
  primeiro login pós-deploy, é só não fazer esse backfill).
- **Correção feita durante a implementação (não estava no desenho original)**:
  a migration `0007_audit_log_actor_username.sql` (rename de `actor_email` ->
  `actor_username`) foi escrita junto com o PR 1, mas **movida para o PR 2**
  antes do merge. Motivo: `recordAudit()` (`src/lib/audit.ts`) é chamado em
  todo login/logout/ação administrativa e ainda faz
  `INSERT INTO audit_log (..., actor_email, ...)` até o código do PR 2 landar.
  Se o rename rodasse no deploy do PR 1, toda gravação de auditoria falharia
  (coluna inexistente) no intervalo entre os dois deploys — `recordAudit` é
  best-effort e nunca lança (não quebraria login), mas deixaria um buraco
  silencioso na trilha de auditoria, incluindo de logins, até o PR 2 mergear.
  Rename e código que depende do nome novo precisam landar no mesmo deploy;
  arquivo com o mesmo conteúdo guardado para reintroduzir no PR 2.
- `scripts/migrate-users-to-username.ts` (novo, padrão de
  `create-test-admin.ts`: pool `mysql2/promise`, credenciais via `.env`,
  `bun run`), com dois modos:
  - `--dry-run`: classifica cada `email.split("@")[0]` (regex `/^\d+$/` ->
    matrícula, resto -> username, validado contra `UsernameSchema`/
    `MatriculaSchema`), detecta colisões e caracteres fora do charset **sem
    escrever nada**, imprime relatório texto puro (total, classificados,
    pendentes de cada campo, conflitos, casos fora do charset).
  - `--apply`: exige confirmação interativa (`readline`, digitar "SIM"),
    roda em transação, `UPDATE` linha a linha, **pula** (não aborta) casos
    de conflito/charset, reimprime o relatório com "APLICADO" + lista curta
    de IDs que precisam de correção manual do admin depois.
  - Não mexe em `password`/`password_changed_at` — isso é escopo do SQL
    acima, mantendo "classificar identificadores" e "resetar estado de
    senha" como responsabilidades separadas e testáveis.
  - Executado manualmente contra produção (dry-run revisado por você antes
    do apply), antes do merge do PR 2.

**PR 2 — o corte real (backend + frontend + testes juntos; não dá para meio-caminho sem quebrar login em produção)**

Backend:
- `src/lib/schemas.ts`: remove `EmailSchema`; adiciona `UsernameSchema`,
  `MatriculaSchema` (seção acima). `PasswordSchema` inalterado (sem
  complexidade nova, não foi pedida).
- `src/lib/session.ts`: `SessionPayload` perde `email`. `resolveSession`
  ganha `username`, `matricula`, `passwordChangeRequired` no retorno (query
  central, seção acima). `issueSession`/`signSessionToken` param sem
  `email`.
- `src/lib/auth-middleware.ts`: `AuthContext.userEmail` -> `userUsername`.
  Checagem de `passwordChangeRequired` fora do try/catch existente, lançando
  `"PasswordChangeRequired: ..."`. Nova variante
  `requireAuthAllowExpiredPassword` (mesmo corpo, sem essa checagem) para
  `changePassword`. Sentry `setUser` troca `email` por `username`.
- `src/lib/auth-api.ts`:
  - `login`: fluxo reordenado (seção "rate limit" acima); branch explícita
    para `password IS NULL` (mensagem "primeiro acesso pendente", nunca
    chama `bcrypt.compare` contra `null`); `auditFail` grava o identificador
    bruto quando a conta não resolve, o username canônico quando resolve.
  - `getMe`: devolve `username`, `matricula`, `passwordChangeRequired` em
    vez de `email`.
  - `logout`: resolve `username` via `SELECT ... WHERE id = ?` (não confia
    mais em campo de payload).
  - Novo `setInitialPassword` e `changePassword` (seção acima).
- `src/lib/rate-limit.middleware.ts`: novo tier `"auth"` em
  `requireRateLimit()`, mapeado para `authLimiter`.
- `src/lib/admin-users.functions.ts`:
  - `listUsers`: `email` -> `username, matricula` + campo derivado
    `pending: boolean` (`password IS NULL`) para a UI sinalizar sem
    duplicar a regra no client.
  - `createUser`: Zod troca `email`+`password` por `username`+`matricula`
    (sem senha — admin não define mais senha nenhuma, `INSERT` grava
    `password = NULL`, zero `bcrypt.hash` nesse caminho).
  - `setUserRole`/`setUserActive`: só troca o campo de auditoria.
  - `resetPassword`: recebe só `{userId}` (não mais senha nova); zera
    `password`/`password_changed_at`, reusando o estado de "primeiro acesso
    pendente".
  - Novo `updateUserIdentifiers({userId, username, matricula})`
    (admin-only) — peça que fecha o próprio ciclo da migração: sem UI de
    edição, usuários legados que ficaram com um campo `NULL` (username ou
    matrícula, a depender do formato do e-mail antigo) nunca conseguiriam
    logar e ninguém teria como corrigir pela interface. Trata
    `ER_DUP_ENTRY` como mensagem amigável de conflito.
- `src/lib/admin-system.functions.ts`: `getAuditLog` troca
  `u.email AS target_email` por `u.username AS target_username` na query
  (só a projeção muda, não há coluna a migrar aqui); `actorEmail` ->
  `actorUsername` nos demais `recordAudit`.
- `src/lib/audit.ts`, `src/lib/audit-tooltip.ts`: `actorEmail`/`targetEmail`
  -> `actorUsername`/`targetUsername`.

Frontend:
- `src/routes/auth.tsx` + `auth.page.tsx`: campo único `identifier`
  (`type="text"`, não mais `type="email"`), copy atualizada, link
  permanente "Primeiro acesso?" apontando para a rota nova.
- `src/routes/primeiro-acesso.tsx` + `.page.tsx` (novo, mesmo padrão de
  `auth.tsx`: `ssr:false`, redireciona pra `/` se já logado): formulário
  username + matrícula + nova senha + confirmação, chama
  `setInitialPassword`, sucesso = já autenticado (auto-login), navega como
  o login já faz.
- `src/routes/trocar-senha.tsx` + `.page.tsx` (novo, **fora** de
  `_authenticated/` — evita caso especial no `beforeLoad` compartilhado e
  evita renderizar layout completo pra quem ainda não pode navegar):
  `beforeLoad` próprio (`getMe()` null -> `/auth`), formulário senha atual +
  nova + confirmação, chama `changePassword`. Sem `autoFocus` em nenhum
  campo e sem `.focus()` programático (evita abrir teclado mobile sozinho),
  mensagens de validação claras reutilizando `PasswordSchema`. Serve tanto
  o fluxo forçado (banner "sua senha expirou") quanto um item de menu
  "Trocar senha" voluntário novo na sidebar/mobile-nav (a tela já existe
  por causa do fluxo forçado, custo marginal baixo, sem isso um usuário que
  queira trocar a senha por iniciativa própria não teria como).
- `src/routes/_authenticated/route.tsx`: `beforeLoad` redireciona para
  `/trocar-senha?next=...` quando `user.passwordChangeRequired`.
  `UserProfile.email` -> `username`. Header/sidebar/`MobileNav` exibem
  `username` em vez de `email`.
- `src/router.tsx`: nova branch em `queryCache.onError` para
  `msg.includes("PasswordChangeRequired")` -> redireciona para
  `/trocar-senha` **sem** logout (comportamento diferente da branch
  `"Unauthorized"` já existente, que desloga).
- `src/components/create-user-dialog.tsx`: remove campo de senha e sufixo
  fixo `@gpabr.com`; dois campos `username`/`matricula`.
- `src/components/reset-password-dialog.tsx`: **deletar** — vira um
  terceiro `type` (`"password"`) no state machine de confirmação que já
  existe em `admin-user-management.tsx` (hoje `"role" | "active"`), sem
  input nenhum, só "zerar a senha desta conta?".
- `src/components/admin-user-management.tsx`: colunas `Username`/
  `Matrícula`, busca por username/matrícula/nome, indicador visual de
  "primeiro acesso pendente", ação de editar identificadores (ícone de
  lápis, dialog reaproveitando layout de `create-user-dialog.tsx`).
- `src/components/mobile-nav.tsx`: prop `userEmail` -> `username`.

Scripts: `scripts/create-test-admin.ts` troca para `username`/`matricula`
fixos de teste, setando `password_changed_at = NOW()` explicitamente (senão
nasce em estado de senha "expirada" e atrapalha toda verificação manual).
`.opencode/skills/run/SKILL.md` também referencia `input[type=email]` e as
credenciais de teste — atualizar junto, senão a skill `run` quebra
silenciosamente na próxima vez que for usada.

Testes (padrão em todos os 8 arquivos: fixture `email: "test@gpabr.com"` vira
`username`/`matricula`; casos novos além da troca mecânica):
- `schemas.test.ts`: `UsernameSchema.parse("12345")` deve falhar (prova que
  a ambiguidade do `OR` no login está fechada).
- `auth-api.test.ts`: `login` com `password IS NULL`; resolução por username
  vs matrícula na mesma linha; rate limit por `id` ao alternar identificador;
  testes inteiros novos de `setInitialPassword`/`changePassword` (incluindo
  reemissão de sessão).
- `auth-middleware.test.ts`: `passwordChangeRequired` lançando fora do catch
  (prova de que não é embrulhado); variante que não bloqueia.
- `admin-users.functions.test.ts`/`.guards.test.ts`: `createUser` sem senha;
  `resetPassword` sem receber senha nova; `updateUserIdentifiers` (conflito
  e sucesso).
- `admin-audit-panel.test.tsx`, `audit-tooltip.test.ts`,
  `admin-user-management.test.tsx`: fixtures atualizadas + fluxo de reset
  sem input de senha.

**PR 3 — limpeza final (só após confirmar estabilidade em produção)**
- Remove coluna `email` de `users` (schema + migration nova).
- Remove qualquer referência residual a `@gpabr.com`/email em scripts/docs
  históricos que ainda mencionam o modelo antigo como se fosse atual (não
  docs históricos que documentam decisões passadas — esses ficam como
  registro).
- Atualiza `docs/continuar.md`: remove o item "sem fluxo de esqueci minha
  senha" como pendência (deixa de fazer sentido — sem e-mail no sistema,
  esse fluxo nunca seria viável mesmo; admin-reseta -> primeiro-acesso é o
  mecanismo definitivo).
- Roda a auditoria final pedida (funcionalidades alteradas, impactos,
  riscos de regressão, pendências, recomendações, confirmação de que não
  sobrou dependência do modelo antigo).

## Decisões assumidas como default (sinalizadas para revisão, não bloqueantes)

1. Nomes de rota: `/primeiro-acesso`, `/trocar-senha` (únicos que casam com o
   resto da UI, já em PT-BR).
2. Auto-login após `setInitialPassword`: sim.
3. `changePassword` derruba outras sessões (mesmo padrão que reset por admin
   já tem hoje).
4. Backfill de `password_changed_at = NOW()` no PR 1 (30 dias de folga a
   partir do rollout, em vez de forçar troca em massa no primeiro login).
5. Charset de username espelha o que `EmailSchema` já usa hoje para a parte
   local (`[a-z0-9._-]`); matrícula = dígitos livres (sem tamanho fixo, já
   que não foi informado um formato conhecido tipo CPF).
6. Username case-insensitive no login (mesmo comportamento que e-mail
   sempre teve, `utf8mb4_unicode_ci` já garante isso na constraint).

## Verificação

- `bun run lint`, `bun run typecheck`, `bun run test` (suíte completa) após
  o PR 2.
- Rodar `scripts/migrate-users-to-username.ts --dry-run` contra o banco real
  de produção e revisar o relatório com você antes de aplicar (`--apply`)
  ou de mergear o PR 2.
- Validação em navegador real (Puppeteer, seguindo o padrão já estabelecido
  nesta sessão): login por username, login por matrícula, primeiro acesso
  completo (conta criada pelo admin sem senha -> define senha -> acessa),
  reset por admin -> primeiro acesso de novo, expiração simulada (forçar
  `password_changed_at` no passado via SQL direto) -> troca obrigatória sem
  logout no meio, troca voluntária pelo menu.
- Checar CI (`schema-check` sobe MariaDB vazio e roda baseline + migrations
  do zero — valida que as migrations novas são idempotentes e não dependem
  de estado intermediário).
- Depois do deploy do PR 2, checar Sentry por qualquer erro novo relacionado
  (mesma disciplina já seguida nesta sessão para os bugs de hidratação).
