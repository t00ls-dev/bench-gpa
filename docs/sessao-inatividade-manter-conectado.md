# Sessão: expiração por inatividade e "Manter conectado"

Como o Bench GPA decide por quanto tempo um cookie de sessão vale, desde a
mudança da PR #59 (30/07/2026). Antes dela, toda sessão era um JWT fixo de 7
dias (`expiresIn: "7d"` hardcoded), comportamento ainda descrito, como
histórico, em `docs/fix-session-cookie-httponly.md`.

Fonte única das constantes: `src/lib/auth-config.ts`. Lógica de emissão e
validação: `src/lib/session.ts`.

## 1. Dois modos, decididos no login

O checkbox "Manter conectado" na tela `/auth` escolhe entre dois modos,
gravados no próprio JWT (`persistent: boolean`) e nunca trocados depois.
Uma sessão não migra de um modo para o outro em voo.

| Modo            | Checkbox   | Expiração                                    | Desliza com uso? |
| --------------- | ---------- | -------------------------------------------- | ---------------- |
| Normal (padrão) | Desmarcado | 1h de inatividade, teto de 24h desde o login | Sim              |
| Persistente     | Marcado    | Fixo, 7 dias desde o login                   | Não              |

- `INACTIVITY_TIMEOUT_SECONDS = 1h`: prazo do cookie no modo normal;
  qualquer request autenticado o renova.
- `SESSION_ABSOLUTE_CAP_SECONDS = 24h`: teto contado a partir do login
  original (`loginAt`, não reemitido no slide). Sem ele, um dispositivo em
  uso contínuo (ex.: terminal fixo numa loja) nunca ficaria ocioso tempo
  suficiente para expirar sozinho, e o slide renovaria para sempre.
- `REMEMBER_ME_EXPIRY_SECONDS = 7 dias`: mesmo valor que já era o padrão
  único do sistema antes desta mudança. Quem marca o checkbox não fica
  pior do que estava; quem não marca passa a ter uma janela de exposição
  bem menor (1h/24h em vez de 7 dias fixos sempre).

## 2. Onde o slide acontece

`resolveSession(token, { slide })` é o único ponto que valida o cookie.
`slide` controla se ele reemite o cookie com um novo prazo como efeito
colateral.

| Chamador                                                               | `slide` | Por quê                                                                                                                                                                                              |
| ---------------------------------------------------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `auth-middleware.ts` (`requireAuth`, toda server function autenticada) | `true`  | É o que dá o comportamento de expiração por inatividade. Cada chamada de verdade "usa" a sessão.                                                                                                     |
| `auth-api.ts` (`getMe`)                                                | `false` | Chamado a cada navegação e cacheado por 60s no client. Reemitir o cookie a cada chamada seria um efeito colateral sem propósito.                                                                     |
| `server.ts` (`handlePdfDownload`)                                      | `false` | Rota fora do fluxo normal de server functions (`/_serverFn/`). Chamar `setCookie` do TanStack Start fora desse contexto de request não é confiável, então essa rota só lê a sessão, nunca a reemite. |

Sessões persistentes (`persistent: true`) nunca deslizam nem checam o teto
de 24h. Os dois se contradiriam.

## 3. Revogação

Independente do modo, todo token carrega `tokenVersion`. `resetPassword`
incrementa `token_version` no banco, e `resolveSession` invalida qualquer
token com uma versão diferente. É o mecanismo que derruba sessões antigas
depois de uma troca de senha. `logout()` (client, `src/lib/auth-api.ts`)
também incrementa `token_version` antes de limpar o cookie, como efeito
colateral aceito para invalidar cópias do token que possam ter vazado.

## 4. Compatibilidade com tokens antigos

Tokens emitidos antes desta mudança não têm `loginAt` nem `persistent` no
payload. `resolveSession` trata a ausência de `persistent` como modo
normal, e a ausência de `loginAt` como se o login fosse agora. Isso dá um
teto de 24h a partir do primeiro uso pós-deploy, em vez de expirar todo
mundo de uma vez.
