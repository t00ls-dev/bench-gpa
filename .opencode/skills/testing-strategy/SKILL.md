---
name: testing-strategy
description: Estratégia de testes do Bench GPA (vitest, cobertura, CI, validação manual). Use ao escrever testes para código novo/alterado, ao decidir se uma mudança precisa de validação manual além dos testes automatizados, ou ao investigar uma queda de cobertura.
---

# Estratégia de testes

## Objetivo

Ter confiança real de que uma mudança funciona: testes automatizados para
lógica, validação manual para o que só se prova rodando de verdade.

## Quando usar

- Escrever ou alterar qualquer código que tenha teste correspondente
- Decidir se uma mudança de UI/UX precisa de verificação visual
- Investigar uma queda no `docs/coverage-summary.md`

## O que fazer

### Automatizado

- `bun run check` roda lint, typecheck e test. É o mínimo antes de
  considerar qualquer tarefa concluída, sempre que houver mudança de
  código (não é necessário para mudança só de documentação).
- Teste server functions com dados mockados. Teste componentes críticos
  (tabelas, formulários, importação). Teste fluxos de autenticação
  (login, logout, sessão expirada ou deslizante).
- `bun run coverage:summary` gera `docs/coverage-summary.md`, com
  thresholds centralizados em `scripts/coverage-thresholds.ts` (fonte
  única, usada tanto por `vitest.config.ts` quanto pelo gerador do
  resumo). Não duplique um número de threshold em outro lugar.
- Estado singleton em módulo (ex.: um `Map` de cache, um anchor de DOM
  reusado) precisa de `vi.resetModules()` mais import dinâmico por teste,
  para não vazar estado de um teste para o outro (ver
  `pdf-download-store.test.ts`, `export-pdf.test.ts` como referência).
- jsdom tem lacunas reais: `.click()` não dispara o `dispatchEvent` do
  próprio elemento internamente (verificado, não é bug de teste),
  `window.location.href` não é navegável sem sobrescrever o objeto. Não
  assuma que jsdom se comporta como um browser real nesses pontos.

### CI

- `.github/workflows/ci.yml`: job `ci` roda lint, typecheck, test, build e
  `bun audit`. Job `schema-check` sobe MariaDB 11.4 real e valida
  migrações (ver skill `database-review`). Pushes comuns não publicam. O job
  `deploy` só roda por dispatch manual na `main`, e somente se os dois gates
  passarem. Tags não iniciam deploy.
- Nunca pular hooks ou gate da CI (`--no-verify` ou equivalente) para
  destravar um merge. Se a CI falha, o problema é real até provado o
  contrário.

### Validação manual

- Mudança de UI/UX, ou qualquer coisa que só se prova rodando: usar a
  skill `run` (dev server, MariaDB real e login real, com screenshot se
  fizer sentido). Testes automatizados verificam correção de código, não
  correção de produto.
- Bug relatado pelo usuário em um browser específico (ex.: Firefox):
  Playwright não é garantia suficiente. O build de Firefox do Playwright
  é patchado para determinismo de automação e já não reproduziu um bug
  real de download que só acontecia no Firefox de verdade. Quando o
  usuário puder confirmar manualmente, isso vale mais que a suíte
  automatizada para esse tipo de bug.
- Resultado de medição (performance, bytes, tempo) sempre registrado em
  doc (`docs/medicao-performance.md`), nunca só relatado no chat.

## Checklist

- `bun run check` verde antes de considerar a tarefa concluída
- Teste novo cobre o caso de regressão real, não só o caminho feliz
- Estado de módulo singleton isolado entre testes
  (`vi.resetModules()` se aplicável)
- Mudança visual/UX validada rodando a aplicação de verdade, não só pela
  suíte
- CI verde (`gh pr checks`) antes de pedir confirmação de merge
