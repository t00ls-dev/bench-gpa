# Produto — Possíveis melhorias

## KPIs e Métricas

- **KPIs com delta em relação ao período anterior**: hoje mostram valor absoluto e delta entre `refValue` vs média histórica. Adicionar comparação com período anterior (se houver dado disponível)
- **Ticket médio do produto**: venda / quantidade (se qty estiver disponível nos dados)
- **Performance na loja**: % da venda total da loja que esse produto representa

## Gráficos

- **Evolução com linha de tendência**: adicionar média móvel (7 dias, 30 dias) sobre o gráfico de evolução
- **Comparação entre lojas com destaque**: destacar a loja atualmente selecionada no bar chart, mostrar a média das demais como referência
- **Gráfico de calor por dia da semana**: quais dias da semana o produto mais vende (útil para identificar padrões sazonais)
- **Tooltip mais rico nos gráficos**: mostrar código do produto, nome, valor, e data completos

## Estados de Loading

- **Skeleton no autocomplete**: enquanto busca produtos, o dropdown mostra "Buscando…" com spinner — poderia exibir skeleton nos resultados
- **Feedback ao trocar de produto**: transição suave entre análises, evitar flash de loading quando possível (`placeholderData: keepPreviousData`)

## Busca

- **Resultados ilimitados**: hoje a busca depende do RPC `product_search` que retorna resultados. Validar se o limite é adequado
- **Busca por código exato ter prioridade**: se o termo de busca corresponde exatamente a um código PLU, destacá-lo como primeiro resultado
- **Histórico de buscas recentes**: salvar últimos 5-10 produtos consultados no localStorage para acesso rápido
- **Atalho de teclado**: Ctrl+K ou / para focar na busca

## Tabelas (Histórico)

- **Exportar histórico (CSV/XLSX)**: botão para baixar as tabelas de histórico como planilha
- **Paginação com mais opções**: hoje fixa em 10 por página, poderia ter 10/25/50/100
- **Coluna de quantidade**: se disponível, mostrar quantidade vendida além do valor
- **Comparar períodos**: selecionar dois intervalos de datas para comparar lado a lado

## Navegação

- **Link para análise de área**: a partir da hierarquia exibida no `ProductHierarchyTrail`, clicar em um nível navegar para `/area` com aquele filtro
- **Produtos relacionados**: na análise de produto, mostrar outros produtos do mesmo departamento/seção que o usuário pode querer consultar
- **Navegação entre produtos**: botões "Anterior" / "Próximo" baseados na lista de resultados da última busca

## UX / Visual

- **Store selector em vez de Select usar MultiSelect**: permitir comparar múltiplas lojas lado a lado
- **Cores hardcoded nos gráficos**: substituir `oklch()` fixo por variáveis CSS do tema
- **Animações nos KPIs**: transição suave ao mudar de produto ou loja
