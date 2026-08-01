---
name: dependency-management
description: Checklist para revisar, atualizar ou adicionar dependências no Bench GPA (bun, Dependabot, overrides). Use ao avaliar uma PR do Dependabot, ao propor adicionar uma lib nova, ou ao investigar um conflito de versão em bun.lock.
---

# Gestão de dependências

## Objetivo

Manter dependências atualizadas sem introduzir instabilidade, e sem
acumular pacotes que ninguém usa.

## Quando usar

- Antes de aprovar ou mergear uma PR do Dependabot
- Antes de adicionar uma dependência nova ao projeto
- Ao investigar um conflito de versão (`bun.lock`, `overrides` em
  `package.json`)

## Processo

### Dependabot

- Config em `.github/dependabot.yml`: `bun` (semanal, segunda-feira),
  limite de 5 PRs abertas simultâneas, mais `github-actions` separado.
- Dois grupos automáticos. `eslint` (eslint, `@eslint/*`,
  `typescript-eslint`), porque essas versões precisam ser compatíveis
  entre si: PRs separadas conflitam em `bun.lock`. E `patch-and-minor`
  (tudo o mais que for patch/minor, baixo risco). Majors de pacotes fora
  do grupo eslint chegam em PRs individuais; revise cada uma isoladamente,
  não agrupe manualmente.
- PR do Dependabot bloqueada esperando um pacote upstream (ex.: PR #91,
  `typescript` 7.0 esperando `typescript-eslint` suportar) não é bug. Não
  force merge nem remova o pacote bloqueador só para destravar.

### Overrides em `package.json`

- Hoje só existe um: `seroval: "^1.5.6"`. Força uma versão única porque
  cópias transitivas do TanStack pedem `^1.5.4` e duplicavam a lib no
  bundle. Antes de adicionar um override novo, confirme que é o mesmo tipo
  de problema (dedupe de transitiva), não um workaround de bug que devia
  ser resolvido rio acima.

### Adicionar uma dependência nova

Antes de instalar, confirme:

- Não dá para resolver com o que já está instalado (grep em `package.json`
  primeiro: muita coisa de UI já vem via shadcn/Radix, muita validação já
  usa Zod).
- Mantida ativamente (commits recentes, não abandonada).
- Tamanho do bundle. Se for client-side, checar impacto (ver skill
  `performance-review`, limite de chunk 200 KB gzip).
- Roda em `bun` sem gambiarra (algumas libs assumem Node puro).

### Auditoria de segurança

- CI roda `bun audit --audit-level=critical` (job `ci` em
  `.github/workflows/ci.yml`), falhando o build em vulnerabilidade
  crítica. Não silencie isso reduzindo o `--audit-level`; corrija ou
  substitua a dependência.

## Checklist

- A versão nova não quebra `bun run check` (lint, typecheck e test)
- `bun run build` continua funcionando
- Nenhum override novo foi necessário sem justificativa clara
- Se for lib nova: justificativa de por que o que já existe no projeto não
  resolve
