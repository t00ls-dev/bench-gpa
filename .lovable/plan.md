## Problema

Em `src/routes/_authenticated/area.tsx`, `openPdfInNewTab` chama `getArea` sem passar `search`, `sortBy` nem `sortDir`. A RPC devolve tudo ordenado pelo default (`val` desc), e o filtro client-side de busca só olha `prod_code`/`prod_name` — ignorando a ordenação escolhida pelo usuário (val / prod_code / prod_name / daysSince, asc/desc).

## Correção

Único arquivo alterado: `src/routes/_authenticated/area.tsx`, função `openPdfInNewTab`.

1. Passar os controles atuais da tabela na chamada `getArea`:
   - `search: search` (trim)
   - `sortBy: sortKey`
   - `sortDir` (o mesmo já derivado de `sortAsc`)
   - `page: null` (mantém: exporta todos, sem paginação)
2. Remover o filtro client-side por `pdfSearch` — a RPC já aplica busca e ordenação, então usar `allData.products` diretamente como `filtered`.
3. Manter o restante (título, período, tabela, colunas) inalterado. `filtered.length` continua sendo a contagem exibida no cabeçalho "Produtos listados".

Resultado: o PDF passa a listar exatamente os mesmos produtos, na mesma ordem, que aparecem na tabela — apenas sem paginação (todas as páginas concatenadas).

Nenhuma mudança em server functions, RPC ou tipos.
