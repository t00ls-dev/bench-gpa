---
name: frontend-quality
description: Checklist de frontend do Bench GPA (shadcn/ui, Tailwind, a11y, formulários, tabelas). Use ao construir uma tela nova, revisar um componente, ou avaliar consistência visual/UX.
---

# Qualidade de frontend

## Objetivo

Manter a UI consistente com o que já existe (mesmo sistema de design,
mesmos padrões de interação) em vez de cada tela nova reinventar um jeito
diferente de fazer a mesma coisa.

## Quando usar

- Construir uma tela ou componente novo
- Revisar um PR com mudança visual
- Investigar inconsistência de UX relatada

## O que checar

### Sistema de design

- shadcn/ui (estilo "New York") + Radix UI para primitivos (Popover,
  Select, Tooltip, DropdownMenu) — não implemente um primitivo do zero se
  o Radix já cobre.
- Tailwind v4 + utilitário `cn()` — nunca CSS module nem
  styled-components; um componente que precisa de estilo condicional usa
  `cn(base, condição && "classe")`, não string concatenada manualmente.
- Recharts para gráficos — já é a lib usada em todo o dashboard, não
  introduza uma segunda lib de charts para um caso pontual.

### Acessibilidade

- Radix já cobre grande parte de teclado/ARIA nos primitivos — não
  sobrescreva `role`/`aria-*` que o Radix já define sem motivo.
- Contraste e foco visível em qualquer elemento interativo novo.
- Atalhos de teclado do sistema (g+letra, Cmd+K, Shift+/) não devem
  colidir com um atalho novo — checar `src/hooks/use-*shortcut*` antes de
  adicionar um novo.

### Formulários

- Validação client-side espelha o schema Zod do server (mesma fonte em
  `src/lib/schemas.ts`) — não escreva uma validação solta divergente da
  que a server function já aplica.

### Tabelas e listas grandes

- Lista grande (ex.: área/produto) usa `@tanstack/react-virtual` — uma
  tabela nova com potencial de centenas de linhas deveria considerar
  virtualização em vez de renderizar tudo de uma vez.

### Rotas e lazy loading

- Toda rota é `.tsx` (boundary/lazy) + `.page.tsx` (componente real) —
  rota nova segue esse split, não um arquivo único.
- Componente client-only (usa `window`, hook de estado, evento) só marca
  o que precisa — React Server Components por padrão.

### Exportação PDF

- Export com nome de arquivo forçado usa o fluxo servidor
  (`openPdfBlob(doc, filename)` → `/api/pdf-download`), não `blob:` URL +
  atributo `download` — Firefox não confia nesse atributo de forma
  confiável (ver histórico em `docs/` sobre o bug real encontrado). Preview
  sem filename (nova aba) continua sendo client-only, isso está correto.

## Checklist

- [ ] Usa componente shadcn/Radix existente antes de construir um novo
- [ ] `cn()` em vez de string de classe concatenada manualmente
- [ ] Validação de formulário reflete o schema Zod do server
- [ ] Lista potencialmente grande considera virtualização
- [ ] Rota nova segue o split `.tsx` + `.page.tsx`
