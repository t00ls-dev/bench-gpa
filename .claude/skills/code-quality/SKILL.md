---
name: code-quality
description: Convenções de código do Bench GPA (TypeScript strict, estrutura de arquivos, server functions, imports). Use ao revisar um diff, escrever código novo, ou decidir onde um arquivo novo deve morar.
---

# Qualidade de código

## Objetivo

Manter o código consistente com as convenções já estabelecidas no projeto
— não introduzir um segundo estilo dentro do mesmo repositório.

## Quando usar

- Ao escrever ou revisar qualquer arquivo `.ts`/`.tsx`
- Ao decidir onde colocar um arquivo novo
- Ao encontrar um padrão inconsistente durante outra tarefa

## Processo

### TypeScript

- Strict mode ligado (`tsconfig.json`), incluindo `noUnusedLocals` e
  `noUnusedParameters`.
- Proibido `any`, `@ts-ignore`, `@ts-expect-error` — se o tipo não fecha,
  o problema é modelar o tipo certo, não silenciar o compilador.

### Server functions

- Toda função de servidor mora em `*.functions.ts`, com schema Zod
  compartilhado de `src/lib/schemas.ts` — nunca schema inline duplicado.
- Autenticação via middleware `requireAuth` (`src/lib/auth-middleware.ts`);
  rate limit via `requireRateLimit` (ver skill `security-audit`).

### Estrutura de arquivos

- Uma responsabilidade por arquivo.
- kebab-case para nomes de arquivo.
- Exports nomeados — exceção: páginas (`.page.tsx`) usam
  `export default function`, exigência do TanStack Router.
- Toda rota é dividida em `.tsx` (rota/lazy boundary) + `.page.tsx`
  (componente real) — é o que dá lazy loading por rota.
- Alias `@/` para `src/`; nunca `../../` (import relativo profundo).

### Estilo visual

- Tailwind v4 + utilitário `cn()` — sem CSS modules, sem
  styled-components.
- shadcn/ui (New York) + Radix UI para componentes de UI (ver skill
  `frontend-quality` para detalhes de acessibilidade/consistência).

### Comentários

- Comente o "porquê" não óbvio (uma decisão, uma armadilha evitada, uma
  referência a um bug real), não o "o quê" — nomes bons já dizem o quê.
  É o padrão já usado em todo `src/lib/*.ts` do projeto (ex.:
  `auth-config.ts`, `content-disposition.ts`).

## Checklist

- [ ] `bun run lint` limpo (warnings pré-existentes de
      `react-refresh/only-export-components` são conhecidos e aceitos —
      não é necessário zerá-los numa mudança não relacionada)
- [ ] `bun run typecheck` limpo
- [ ] Sem `any`/`@ts-ignore` novos
- [ ] Server function nova tem schema Zod em `schemas.ts`, não inline
- [ ] Arquivo novo segue a convenção de nome/estrutura da pasta onde entrou
