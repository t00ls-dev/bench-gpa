# Área — Possíveis melhorias

## KPIs

- **Delta vs período anterior**: adicionar botão de comparação para ver evolução dos KPIs (ex: venda total vs mês anterior)
- **Ticket médio por PLU**: venda média / qty total de itens
- **PLUs inativos**: produtos sem venda há mais de 60/90/180 dias, separado do "sem venda no período"

## Filtros

- **Comparação de períodos**: igual ao dashboard, permitir selecionar "Comparar com período anterior" e exibir KPIs em paralelo
- **Salvar presets de análise**: combinação de loja + departamento + seção como atalho (ex: "Açougue SP Semanal")
- **Filtro por data mais flexível**: atualmente o período default são os últimos 7 dias. Permitir selecionar mês completo, trimestre, etc.
- **Filtro de busca global**: buscar PLU ou nome em toda a hierarquia, não apenas nos produtos já carregados

## Tabela de Produtos

- **Colunas adicionais configuráveis**: permitir que o usuário escolha quais colunas exibir (ex: Qtd, Depto, Seção, Grupo, Subgrupo, Última venda)
- **Exportar seleção**: exportar apenas os produtos filtrados/buscados em PDF ou XLSX
- **Marcação de produtos**: checkbox para selecionar produtos e realizar ações em lote (ex: exportar, comparar)
- **Tooltip com informações estendidas**: ao passar o mouse sobre o PLU, mostrar tooltip com dados adicionais (última venda, média de vendas, etc.)
- **Ordenação por múltiplas colunas**: permitir segurar Shift para ordenar por mais de um campo
- **Cor na linha de produto sem venda**: já existe destaque amber, mas poderia ter intensidade variável baseada em dias sem venda (gradiente)

## PDF

- **PDF incluir KPIs**: atualmente exporta apenas a tabela, sem os cards de KPI do topo
- **PDF com gráficos**: incluir screenshot ou representação textual dos gráficos
- **Layout mais refinado**: o PDF atual tem colunas "QTD" e "VALIDADE" que são sempre vazias (`didParseCell` limpa o texto)
- **Nome do arquivo mais descritivo**: incluir loja, departamento e período no nome do arquivo

## Performance

- **Múltiplas queries de filter-options**: cada dropdown de filtro faz uma query separada (`baseOpts`, `deptosOpts`, `secoesOpts`, `gruposOpts`, `subgruposOpts`). Poderia ser otimizado em uma única chamada que retorna todas as opções em cascata
- **Cliente filtra produtos**: `prodCodes` é filtrado no cliente após buscar todos. Para bases muito grandes, pode ser lento. Considerar paginação ou filtro server-side quando `prodCodes` estiver preenchido

## UX / Navegação

- **Drill-down visual**: breadcrumb é textual, poderia ser visual com clickable steps
- **Click fora da linha**: hoje apenas o clique na linha abre o produto, mas botões de ação (ex: "Ver") poderiam ser mais explícitos
- **Comparar produtos**: selecionar 2+ produtos na tabela e abrir comparativo lado a lado
- **Favoritar produtos**: permitir marcar produtos como favoritos para acesso rápido

## Geral

- **Empty state mais informativo**: "Nenhum produto encontrado" poderia sugerir ajustes nos filtros
- **Cores hardcoded**: substituir `oklch()` fixo por variáveis CSS do tema (dark mode)
