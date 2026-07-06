# Melhorias globais (todas as rotas)

## Tema / Dark Mode

- **Consistência de cores**: várias páginas usam `oklch()` hardcoded nos gráficos (ex: `oklch(0.48 0.12 165)`, `oklch(0.32 0.09 265)`). Extrair para variáveis CSS no tema para suportar dark mode
- **Modo escuro**: já existe `useTheme` hook e script anti-flash no SSR, mas verificar se todos os componentes respeitam as variáveis CSS (charts com cores fixas, backgrounds hardcoded)
- **Cores de estado**: sucesso/erro/warning usam classes utilitárias que funcionam em dark/light, mas componentes como `ImportCalendar` têm cores hardcoded (`bg-emerald-50`, `bg-amber-50`)

## Performance

- **Cache compartilhado**: `getFilterOptions` é chamado com `staleTime: 5min` em várias páginas de forma independente (dashboard e area). Poderiam compartilhar cache
- **React Query garbage collection**: `gcTime` de 5-10 minutos pode manter dados desnecessários na memória
- **Chamadas paralelas**: páginas que fazem múltiplas queries poderiam usar `useQueries` com suspense ou combinadas em server functions
- **Prefetch**: prefetch de dados prováveis ao passar o mouse sobre links da sidebar

## Navegação

- **Sidebar com indicador de página ativa**: o `isActive` usa `===` no path, o que pode falhar para sub-rotas
- **Mobile**: bottom tab navigation existe, mas não tem badges ou notificações
- **Atalhos de teclado**: navegação entre páginas via teclado (ex: 1-Dashboard, 2-Produto, 3-Área)

## Tratamento de Erros

- **Error boundaries por seção**: hoje o `ErrorComponent` no `__root.tsx` captura erros de qualquer rota, derrubando a página inteira. Considerar error boundaries por widget
- **Retry automático**: React Query `retry` varia (1 no area, default no dashboard). Padronizar política
- **Feedback de erro mais rico**: além de "Tentar novamente", mostrar qual operação falhou e sugestões

## Acessibilidade

- **ARIA labels**: alguns botões de ação não têm `aria-label` (ex: botões de toggle admin no admin.tsx)
- **Foco em modais**: garantir que foco seja preso dentro de modais e retornado ao fechar
- **Contraste de cores**: verificar se todos os textos têm contraste suficiente (especialmente em ranking-cards com `text-muted-foreground`)
- **Navegação por teclado**: ordenação de tabelas, dropdowns, multi-selects

## Internacionalização

- **Idioma**: app está em português brasileiro (consistente), mas algumas strings de erro genéricas podem vir do Supabase em inglês
- **Formatos**: `fmtBRL`, `fmtInt`, `fmtBRShort` estão em pt-BR (consistente)

## Componentes Reutilizáveis

- **Componentizar gráficos**: `BarChart`, `LineChart` com mesma configuração de tooltip/grid/stroke poderiam ser wrappers reutilizáveis
- **Componentizar tabela sortável**: área.tsx implementa sua própria lógica de ordenação. Extrair hook `useSortable` ou componente `SortableTable`
- **Componentizar paginação**: área e produto têm implementações diferentes de paginação

## Testes

- **Nenhum teste encontrado**: considerar adicionar testes unitários para utils (`shiftPeriod`, `computePreset`, parsers) e testes de integração para server functions
- **Testes de componente**: componentes críticos como `FilterBar`, `DateRangePicker`

## Documentação

- **Comentários no código**: alguns comentários em português explicam decisões de design (bom). Adicionar jsdocs para funções públicas
- **Storybook**: para componentes de UI, ter catálogo visual

## Build / CI

- **Verificar bundle**: algumas libs como `jspdf` e `xlsx` são grandes. Verificar tree-shaking e carregamento lazy
- **Lint**: já tem ESLint configurado. Verificar se cobre todos os patterns do projeto
