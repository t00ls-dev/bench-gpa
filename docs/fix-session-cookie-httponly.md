# Fix: cookie de sessão JWT não era `httpOnly`

> Data: 22/07/2026
> Referência: achado crítico #1 em [`docs/analise-completa.md`](./analise-completa.md)

## Problema

O token JWT de sessão era gravado e removido inteiramente no client, via `document.cookie`:

- `src/routes/auth.page.tsx:99` (login): montava a string do cookie manualmente e escrevia via `document.cookie`.
- `src/router.tsx:26` (sessão expirada): limpava via `document.cookie`.
- `src/routes/_authenticated/route.tsx:109` (logout): limpava via `document.cookie`.

`document.cookie` **não pode** setar a flag `HttpOnly`: só o servidor pode fazer isso via header `Set-Cookie` de uma resposta HTTP. Como resultado, o JWT ficava 100% legível por qualquer JavaScript rodando na página. Um XSS (dependência comprometida, markdown mal sanitizado, etc.) seria suficiente para roubar a sessão de qualquer usuário, inclusive admin.

O código já continha funções (`sessionCookie()` / `clearSession()` em `src/lib/auth-api.ts`) que montavam um cookie `httpOnly` corretamente com a lib `cookie`, mas elas nunca eram usadas para gerar de fato um header `Set-Cookie`. `login()` retornava só a string do token para o client gravar; `logout()` retornava `{ cookie }` que nenhum caller aplicava. Infraestrutura de segurança pronta, porém morta.

## Correção

A ideia central: o cookie de sessão agora é setado **inteiramente no servidor**, dentro dos próprios `handler`s dos server functions `login`/`logout`, usando os helpers nativos do TanStack Start (`@tanstack/react-start/server`), que expõem as primitivas de cookie do h3 por baixo:

```ts
import { getCookie, setCookie, deleteCookie } from "@tanstack/react-start/server";
```

### `src/lib/auth-api.ts`

- `sessionCookie()`/`clearSession()` (que retornavam uma _string_ de cookie, nunca aplicada) foram substituídas por `setSessionCookie()`/`clearSessionCookie()`, que chamam `setCookie()`/`deleteCookie()` diretamente: efeito colateral real no header da resposta, não um valor de retorno para o caller aplicar.
- `login()` agora chama `setSessionCookie(token)` dentro do handler e **retorna só `{ ok: true }`**. O token JWT não é mais devolvido ao client em nenhum momento. O navegador recebe o cookie via `Set-Cookie` (já `httpOnly`, `sameSite: "lax"`, `secure` em produção) automaticamente, sem o client precisar tocar nele.
- `getMe()` passou a ler o cookie via `getCookie("session")` em vez de fazer parse manual do header `cookie` com a lib `cookie`. Também removi os 5 `console.log` que vazavam cookie header (100 chars), e-mails e erros de verificação de JWT para o log de produção (`logs/pm2-out.log`). Esse vazamento ficaria ainda mais sem sentido depois do cookie virar `httpOnly`.
- `logout()` chama `clearSessionCookie()` (que faz `deleteCookie("session", { path: "/" })`) e retorna `{ ok: true }`.
- Import da lib `cookie` (`serialize`/`parse`) foi removido: não é mais necessário.

### Client: parar de tocar no cookie de sessão

- `src/routes/auth.page.tsx`: removida a linha que montava e gravava o cookie manualmente após `login()`. O client só chama `await login({ data: payload })` e navega; o cookie já chega pronto no `Set-Cookie` da própria resposta do server function (fetch same-origin aplica automaticamente).
- `src/router.tsx` (handler de sessão expirada no `QueryCache`): trocado `document.cookie = "session=; ..."` por uma chamada real ao server function `logout()` (import dinâmico, igual ao padrão já usado no resto do app). Antes, essa linha era um no-op inofensivo mas inútil: um cookie `httpOnly` não pode ser sobrescrito/limpo por JS, então a "limpeza" nunca teria efeito nenhum depois desta mudança se não fosse corrigida.
- `src/routes/_authenticated/route.tsx` (`signOut()`), mesma troca: chama `logout()` via import dinâmico em vez de mexer em `document.cookie`.

### Testes: `src/lib/auth-api.test.ts`

Reescrevi os mocks e asserts para o novo contrato:

- Mock de `@tanstack/react-start/server` ganhou `getCookie`/`setCookie`/`deleteCookie` (antes só tinha `getRequest`); removido o mock da lib `cookie` (não é mais importada pelo arquivo testado).
- `login`: teste agora verifica `setCookie` chamado com `{ httpOnly: true, path: "/", sameSite: "lax" }` e que o retorno é `{ ok: true }` (antes verificava que o token cru vinha no retorno, o comportamento antigo que este fix elimina). Adicionei um assert de que `setCookie` **não** é chamado quando a senha está errada.
- `getMe`: passou a mockar `getCookie` em vez de simular o header `cookie` cru. Adicionei um caso novo: `getCookie` retornando `undefined` (sem cookie) → `getMe()` retorna `null`.
- `logout`: verifica `deleteCookie("session", { path: "/" })` e retorno `{ ok: true }` (antes verificava um campo `cookie` no retorno que nunca era usado por ninguém).

## Verificação

```
bun run typecheck   # 0 erros
bun run test        # 138 passed (137 → 138; +1 teste novo em getMe)
npx eslint --fix src/lib/auth-api.ts src/lib/auth-api.test.ts src/routes/auth.page.tsx src/router.tsx src/routes/_authenticated/route.tsx
```

Não rodei `bun run build`/teste manual em navegador nesta sessão: o ambiente não tem acesso ao MariaDB/rede externa necessário para subir o app. **Recomendo validar em dev/staging antes do deploy**: fazer login, confirmar no DevTools (aba Application → Cookies) que `session` aparece com a flag `HttpOnly` marcada e que `document.cookie` no console **não** lista mais `session`; testar logout e o fluxo de sessão expirada.

## Arquivos alterados

| Arquivo                                 | Mudança                                                                                                                                                      |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/lib/auth-api.ts`                   | Cookie setado/limpo via `setCookie`/`deleteCookie` no server; `login` não retorna mais o token; `getMe` lê via `getCookie`; `console.log` de debug removidos |
| `src/routes/auth.page.tsx`              | Removida escrita manual de `document.cookie` após login                                                                                                      |
| `src/router.tsx`                        | Sessão expirada agora chama `logout()` real em vez de tentar limpar `document.cookie`                                                                        |
| `src/routes/_authenticated/route.tsx`   | `signOut()` agora chama `logout()` real em vez de tentar limpar `document.cookie`                                                                            |
| `src/lib/auth-api.test.ts`              | Mocks/asserts atualizados para o novo contrato (`setCookie`/`getCookie`/`deleteCookie`)                                                                      |
| `docs/analise-completa.md`              | Análise completa do código (item separado, já entregue antes deste fix)                                                                                      |

## O que **não** foi feito (fora do escopo deste fix, listado para não parecer esquecido)

Itens relacionados a sessão/autenticação que ficaram registrados em `docs/analise-completa.md` mas que não foram tocados aqui, por não fazerem parte do pedido ("corrija o httpOnly"):

- Sem revogação/blacklist de token: um JWT copiado antes do logout continua válido até expirar (7 dias). ~~Resolvido em 30/07/2026 (PR #59)~~: expiração deixou de ser um `expiresIn: "7d"` fixo, ver `docs/sessao-inatividade-manter-conectado.md`.
- Cache de `assertAdmin` (`admin-utils.ts`) continua com janela de até 5 min para revogar privilégio de admin após um rebaixamento.
- ~~Deploy ainda não é gateado pelo resultado da CI, e a CI ainda não roda lint/typecheck~~ Resolvido: `deploy` tem `needs: [ci, schema-check]` (`.github/workflows/ci.yml:110`), e `ci` roda lint/typecheck/test/build.

Esses seguem priorizados em `docs/analise-completa.md`.
