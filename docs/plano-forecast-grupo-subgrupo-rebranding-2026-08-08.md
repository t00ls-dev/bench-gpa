# Planejamento de Produção — agrupar também por Grupo e Subgrupo

## Contexto

A tabela `/forecast` hoje agrupa só por Seção (cabeçalho + subtotal),
com os produtos de cada seção numa lista plana ordenada por valor
esperado. O usuário pediu o mesmo tratamento pros dois níveis
seguintes da hierarquia: Seção → Grupo → Subgrupo → produtos, cada
nível com seu próprio cabeçalho/subtotal, igual ao que já existe pra
Seção.

`grupo`/`subgrupo` já existem como colunas em `sales_prod_daily_agg` e
`product_universe` (usadas em Área) — a proc `production_forecast` já
calcula `MAX(grupo)` internamente (só pra filtrar), mas nunca devolve
`grupo`/`subgrupo` por produto no resultado. É essa lacuna que abre
espaço pro agrupamento.

Decisões confirmadas com o usuário:
- **Ramos vazios de Grupo/Subgrupo não aparecem** — diferente da regra
  de Seção (que sempre aparece, mesmo com R$0, porque vem do catálogo
  completo em `product_universe`), Grupo e Subgrupo só existem na
  árvore quando têm pelo menos um produto individual ou um agregado
  "outros" no dia. Isso já é uma consequência natural de construir a
  árvore a partir do que a proc devolve (sem um result set adicional
  tipo "todo grupo/subgrupo do catálogo") — não precisa de lógica
  especial pra "esconder vazio", só não os cria.
- **"Outros" fica mais granular**: passa a ser calculado por (Seção,
  Grupo, Subgrupo), não só por Seção — aparece dentro do Subgrupo a
  que pertence.

## 1. Proc `production_forecast` (edição em produção, protocolo de sempre)

Candidata testada sob o nome `production_forecast_v3_candidate`
primeiro (próximo número depois do `_v2_candidate` usado na entrada de
2026-08-08 de `docs/medicao-performance.md`), medida com
`scripts/bench-procs.sh` contra a baseline atual (178-229ms), só depois
renomeada pro nome definitivo.

Mudanças na proc (`scripts/migrate-schema.sql`, em torno da linha 1300):

```sql
CREATE TEMPORARY TABLE tmp_product_forecast ENGINE=InnoDB AS
SELECT prod_code, MAX(prod_name) AS prod_name, MAX(secao) AS secao,
       MAX(grupo) AS grupo, MAX(subgrupo) AS subgrupo,
       COUNT(*) AS occurrences,
       AVG(val_vda) AS forecast_val, MIN(val_vda) AS forecast_min, MAX(val_vda) AS forecast_max
FROM sales_prod_daily_agg
WHERE ...  -- filtros inalterados
GROUP BY prod_code;

-- Result set 1: individual
SELECT prod_code, prod_name, secao, grupo, subgrupo, occurrences, forecast_val, forecast_min, forecast_max
FROM tmp_product_forecast
WHERE occurrences >= p_min_occurrences
ORDER BY secao, grupo, subgrupo, forecast_val DESC;

-- Result set 2: outros, agora por (secao, grupo, subgrupo)
SELECT secao, grupo, subgrupo, COUNT(*) AS num_produtos, SUM(forecast_val) AS outros_val
FROM tmp_product_forecast
WHERE occurrences < p_min_occurrences
GROUP BY secao, grupo, subgrupo;

-- Result set 3 (lista de seções): inalterado, continua só `secao`
```

`p_secoes`/`p_grupos` (filtros já existentes) e `tmp_filters` não mudam.

## 2. Tipos (`src/lib/api-types.ts`)

`ProductionForecastProduct` ganha `grupo: string | null` e
`subgrupo: string | null`.

`ProductionSecaoForecast` deixa de ter `produtos`/`outrosVal`/
`outrosNumProdutos` direto — esses campos descem 2 níveis:

```ts
export interface ProductionOutrosAggregate {
  numProdutos: number;
  outrosVal: number;
}
export interface ProductionSubgrupoForecast {
  subgrupo: string | null; // null = "Sem subgrupo"
  produtos: ProductionForecastProduct[];
  outros: ProductionOutrosAggregate | null;
  totalSubgrupo: number;
}
export interface ProductionGrupoForecast {
  grupo: string | null; // null = "Sem grupo"
  subgrupos: ProductionSubgrupoForecast[];
  totalGrupo: number;
}
export interface ProductionSecaoForecast {
  secao: string;
  grupos: ProductionGrupoForecast[]; // [] quando a seção não teve nada no dia (regra existente, inalterada)
  totalSecao: number;
}
```

## 3. `production.functions.ts` — construir a árvore

Troca o `filter` plano atual por um agrupamento em 3 níveis (`Map`
aninhado preserva ordem de inserção = ordem do `ORDER BY` da proc, sem
precisar reordenar em JS): itera `individualRows` primeiro (fixa a
ordem natural vinda do `ORDER BY secao, grupo, subgrupo, forecast_val
DESC`), depois `outrosRows` pra popular/criar o agregado de cada
(secao, grupo, subgrupo) -- um combo que só existe em outros (nenhum
produto individual) ainda precisa aparecer na árvore. `secoesRows`
continua sendo a fonte de quais Seções sempre aparecem (regra
inalterada); pra cada seção, os grupos vêm do que foi acumulado no Map
(ou `[]` se nada).

## 4. `src/lib/production-filter.ts` — `computeVisibleSecoes` recursivo

Mesma estrutura de hoje (`selected ? recalcula-e-filtra : passa
direto`), só que recursiva nos 3 níveis: sem `productFilter`, devolve
`secoes` como veio do servidor (preserva seções vazias). Com
`productFilter` ativo, filtra produtos em cada subgrupo, zera
`outros`, remove subgrupos/grupos que ficaram vazios, recalcula
`totalSubgrupo`/`totalGrupo`/`totalSecao`/`totalGeral` de baixo pra
cima -- mesmo espírito (e mesma função, só mais fundo) do que já existe.

## 5. `ProductionTable` — renderização em 3 níveis

`Fragment` por Seção (like today) → dentro, `Fragment` por Grupo →
dentro, `Fragment` por Subgrupo → produtos + outros (se houver).
Hierarquia visual por indentação/cor crescente:
- Seção: `bg-muted/40`, uppercase, bold (inalterado).
- Grupo: fundo mais claro (`bg-muted/20`), levemente indentado, sem
  uppercase.
- Subgrupo: sem fundo, mais indentado, `text-muted-foreground`.
- Produto: indentação máxima (como hoje, só desloca mais).

Cada nível mostra label + subtotal à direita, igual ao padrão já usado
em Seção. Label "Sem grupo"/"Sem subgrupo" quando o valor é `null`.

## 6. `use-production-pdf-export.ts` — espelhar os 3 níveis

Mesma ideia das linhas de cabeçalho de seção hoje (`colSpan: 6`), só
que 3 variações de estilo (fillColor/indentação via espaços no início
do texto) para Seção/Grupo/Subgrupo. "Outros" nasce dentro do Subgrupo
certo agora, mantendo o asterisco/nota de rodapé (`OUTROS_CAVEAT_TEXT`,
inalterado).

## 7. Testes a reescrever (fixtures mudam de forma, não só valores)

- `src/lib/production.functions.test.ts`: construção da árvore a
  partir dos 4 result sets (incluindo o caso de um combo que só existe
  em "outros", sem produto individual).
- `src/lib/production-filter.test.ts`: `computeVisibleSecoes` recursivo.
- `src/components/production-table.test.tsx`: fixtures com 2-3 níveis,
  renderização de cada cabeçalho/subtotal, "Sem grupo"/"Sem subgrupo".
- `src/hooks/use-production-pdf-export.test.ts`: corpo do PDF com as
  novas linhas de Grupo/Subgrupo.

## 8. Rebranding: "Planejamento de Produção" → "Previsão de Produção"

Puro texto de exibição, nenhuma mudança de rota (`/forecast` já está em
inglês desde a PR #247, fica como está -- combina com "Previsão", ao
contrário de "Produção" isolado). Lugares a trocar:

- `src/routes/_authenticated/forecast.page.tsx:122` -- título H1 da página.
- `src/routes/_authenticated/route.tsx:209` -- label do menu lateral.
- `src/components/mobile-nav.tsx:25` -- label da nav mobile, hoje só
  `"Produção"`; troca pra `"Previsão"` (forma curta, mesmo estilo de
  "Dashboard"/"Produto"/"Área" já usado ali).
- `src/hooks/use-production-pdf-export.ts:58` -- título impresso no PDF.

Nomes de arquivo/rota/variável/função continuam em inglês
(`forecast.tsx`, `ProductionTable`, `useProductionPdfExport`,
`production.functions.ts` etc.) -- é só o texto visível ao usuário que
muda, sem tocar em identificadores técnicos (mesma distinção já
aplicada quando `/producao` virou `/forecast`).

## Verificação

- `bun run lint && bun run typecheck && bun run test`.
- `scripts/bench-procs.sh` antes/depois da proc candidata, comparar
  com a baseline de 178-229ms; registrar em
  `docs/medicao-performance.md` antes de renomear pro nome definitivo.
- Navegador local (skill `run`): loja 1516, conferir a árvore completa
  de 3 níveis, um caso de "outros" dentro de um subgrupo específico,
  filtro de Produto ainda funcionando (narrowing recursivo), gerar o
  PDF de novo e comparar com `pdftotext`/`pdftoppm`. Conferir também o
  rebranding: título da página, menu lateral, nav mobile, overlay de ajuda
  (`?`) e título do PDF todos
  mostrando "Previsão de Produção" (ou "Previsão" na nav mobile).
