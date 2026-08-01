---
name: security-audit
description: Checklist de segurança do Bench GPA (rate limiting, CSP, auth, IDOR, uploads). Use ao revisar uma rota/server function nova, investigar um relato de possível vulnerabilidade, ou antes de expor um endpoint novo publicamente.
---

# Auditoria de segurança

## Objetivo

Evitar reintroduzir uma classe de vulnerabilidade que o projeto já
corrigiu, e pegar as óbvias antes de chegar em produção.

## Quando usar

- Server function ou rota nova, especialmente se aceita input do usuário
  ou é acessível sem auth
- Investigando um relato de comportamento suspeito
- Antes de expor qualquer coisa nova para a internet (endpoint, upload)

## O que checar

### Autenticação e autorização

- Toda server function que precisa de login usa o middleware `requireAuth`
  (`src/lib/auth-middleware.ts`) — não reimplemente checagem de sessão
  manualmente.
- IDOR: uma checagem de identidade não é suficiente se o recurso pertence
  a outro usuário — sempre valide propriedade (ver
  `src/lib/pdf-download-store.ts`: token isolado por `userId`, não só por
  posse do token).
- Papel/role vem do banco na validação (`assertAdmin` refaz a consulta),
  não do payload do JWT congelado na emissão — um usuário rebaixado não
  pode seguir com privilégio até o token expirar.
- Revogação de sessão: troca de senha e logout incrementam
  `token_version` no banco — todo token com versão antiga vira inválido
  (ver `docs/sessao-inatividade-manter-conectado.md`).

### Rate limiting

- `requireRateLimit` (`src/lib/rate-limit.ts`) em toda server function
  autenticada — 4 tiers por IP (SSR 300/min, API 300/min, Upload 200/min,
  Auth 10/min) mais um balde por conta no login (5/15min por e-mail),
  contra credential stuffing distribuído.
- IP resolvido via `getClientIp()` respeitando a cadeia de confiança
  Cloudflare → nginx (ver `docs/seguranca-ip-e-cloudflare.md`) — nunca
  confie em `X-Forwarded-For` bruto sem essa ordem.

### Input e redirects

- Toda validação de input do usuário passa por schema Zod
  (`src/lib/schemas.ts`), nunca checagem manual solta.
- Redirect pós-login (`sanitize-next.ts`) compara `.origin` da URL
  parseada, não prefixo de string — um prefixo de string
  (`startsWith("/")`) é vulnerável a open redirect via
  `//evil.com`/`/\evil.com`. Esse bug já foi corrigido uma vez — não
  reintroduza a versão ingênua.
- Upload de arquivo: validar tipo e tamanho antes de processar, nunca
  confiar em extensão/Content-Type informado pelo cliente.

### Headers e transporte

- CSP com nonce por request (`script-src 'nonce-...' 'strict-dynamic'`),
  HSTS, `x-content-type-options: nosniff` — ver `applySecurityHeaders` em
  `src/server.ts`.
- Resposta binária (ex.: PDF) usa `Cache-Control: no-store, no-transform`
  e `Content-Length` explícito — evita proxy/CDN no meio do caminho
  recomprimir ou truncar o corpo.
- Filename em `Content-Disposition` sempre via
  `contentDispositionHeader()` (RFC 6266, fallback ASCII +
  `filename*=UTF-8''...`) — nunca interpolado direto no header.

### Auditoria

- Ações sensíveis (login ok/falho, logout, criação/alteração de usuário,
  reset de senha, purga) gravam em `audit_log`, visível em
  `/admin` → aba Auditoria. Endpoint novo que muda estado sensível deveria
  gravar ali também.

### Fora do escopo deste repositório

- Estado de infraestrutura viva (fail2ban, allowlist Cloudflare na
  origem, retenção de backup) não é verificável só lendo o código — está
  registrado em `docs/analise-servidor-producao-2026-07-31.md` como
  pendência consciente, não reabra isso sem o usuário pedir.

## Checklist

- [ ] `requireAuth` + `requireRateLimit` presentes se a rota exige login
- [ ] Recurso validado por propriedade (`userId`), não só por posse de
      token/ID
- [ ] Input validado por schema Zod
- [ ] Nenhum redirect construído por prefixo de string
- [ ] Ação sensível nova grava em `audit_log`
