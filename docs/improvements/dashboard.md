# Dashboard — Possíveis melhorias

## KPIs e Métricas

- **Mais KPIs no topo**: hoje exibe apenas "Venda total". Adicionar:
  - Quantidade de itens vendidos (se o RPC retornar `qty`)
  - Ticket médio (venda total / nº transações)
  - Produtos distintos vendidos
  - Margem (se houver dado de custo)
- **Grid de KPIs** (2x2 ou 4 colunas) em vez de card único

## Gráficos

- **Comparação visual período anterior**: sobrepor a linha do período anterior no gráfico "Evolução diária" (já existe `data.previous.byDate` retornado pelo RPC). Linha tracejada com legenda "Período atual" vs "Período anterior"
- **Click-through nas barras do Top Lojas**: clicar em uma barra navegar para `/area` com o filtro de loja pré-preenchido
- **Gráfico de composição (treemap/heatmap)**: vendas por loja em formato mais visual

## Rankings / Navegação

- **Click-through nos rankings**: clicar em departamento/seção/grupo navega para `/area` com os filtros da hierarquia pré-preenchidos
- **Expandir para ver mais**: botão "Ver todos" nos rankings (hoje limitado a 10)
- **Ordenação customizada**: permitir ordenar rankings por nome ou valor

## Estados de Loading

- **Skeleton nos rankings durante carregamento inicial**: hoje quando `rankings` é `undefined` e `isLoading` é `false` (antes da query disparar), exibe "Sem dados." em vez de esqueleto
- **Skeleton nos charts**: quando `data` está carregando, os gráficos ficam vazios (apenas eixos) sem feedback visual
- **`placeholderData: keepPreviousData`** no React Query para evitar flash de loading ao trocar filtros

## Exportação

- **Exportar relatório em PDF** (jsPDF já é dependência no projeto): KPIs + gráficos + rankings
- **Exportar dados em XLSX** (SheetJS já é dependência): tabela de rankings com valores

## Filtros

- **Chips de filtros ativos**: exibir os filtros selecionados como chips removíveis acima do conteúdo, facilitando a visualização do que está ativo
- **Salvar presets de filtros**: permitir salvar combinações nomeadas de filtros no localStorage (ex: "Análise mensal SP", "Comparativo semanal")
- **Auto-refresh**: botão ou intervalo configurável para recarregar dados automaticamente

## Performance / Cache

- **Unificar `getDashboard` e `getDashboardRankings`**: reduzir de 2 chamadas server function para 1, diminuindo latência
- **Debounce em mudanças de filtro**: evitar disparar queries a cada alteração em cascata (multi-select muda um valor por vez)

## UX / Visual

- **Cores hardcoded nos gráficos**: substituir valores OKLCH fixes por variáveis CSS do tema (dark mode)
- **Indicador de atualização dos dados**: mostrar "Dados atualizados em: DD/MM/YYYY HH:mm" baseado no `import_log` mais recente
- **Animações nos KPIs**: transição suave ao mudar valores entre filtros

## Arquitetura

- **Componentizar widgets do dashboard**: extrair `DailySalesChart`, `TopStoresChart`, `KPIGrid`, `ComparisonChart` em componentes separados para facilitar manutenção e testes
- **Error boundaries individuais**: evitar que um widget quebrado derrube o dashboard inteiro
