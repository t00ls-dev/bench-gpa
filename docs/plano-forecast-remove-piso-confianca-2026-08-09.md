# Remove o piso de confiança / "Outros" — todo produto vira individual

## Contexto

A linha "Outros produtos com histórico no dia (N) — poucas vendas no
período (abaixo do mínimo de confiança pra estimativa individual)"
resumia, num agregado sem PLU, todo produto com menos de
`PRODUCTION_MIN_OCCURRENCES` (4) ocorrências no dia da semana dentro da
janela de 8 semanas. Feedback do usuário: essa linha não ajuda em nada
— só diz "existem produtos sem confiança" sem dar nenhuma informação
acionável. Pedido explícito: **comportamento idêntico** ao dos produtos
"com confiança" — todo produto que vendeu ao menos uma vez na janela
vira uma linha individual, com PLU, nome e faixa mín/média/máx
calculada sobre as ocorrências que tiver (mesmo que seja só 1, caso em
que mín = média = máx — um único dado real à mostra, não mais um
agregado escondendo identidade).

Isso remove o conceito de piso de confiança inteiro (`PRODUCTION_MIN_OCCURRENCES`)
como filtro de exibição — não só o texto da ressalva, a lógica de
"Outros" desaparece de vez (proc, tipos, filtro, tela, PDF).

**Efeito colateral esperado (bom)**: a proc fica mais simples e barata,
não mais cara — remove inteiramente o segundo `GROUP BY secao, grupo,
subgrupo` (result set 2, "outros"), que era justamente o motivo do
aumento de 178ms→281ms medido na v3. A expectativa é essa mudança
reverter esse aumento (medir de qualquer forma, sem exceção pra "parece
seguro").

**Efeito colateral esperado (neutro, avisar mas não bloquear)**: mais
produtos aparecem na tabela agora sem agregação (ex.: loja 1516 tinha
~1253 linhas individuais + "outros"; agora são ~3396 linhas
individuais, todas com PLU próprio). A tabela já não usa virtualização
(comentário em `production-table.tsx` já ficou desatualizado sobre
volume "bem abaixo da AreaTable") — não é escopo deste pedido, só um
aviso.

## 1. Proc `production_forecast` (edição, protocolo de sempre)

Candidata testada sob `production_forecast_v4_candidate` em produção
via SSH antes de renomear, medida com `scripts/bench-procs.sh`.

Mudanças (`scripts/migrate-schema.sql`, em torno da linha 1314):
- Assinatura perde `p_min_occurrences INT` (de 6 pra 5 parâmetros):
  `production_forecast(p_store_code, p_target_date, p_lookback_occurrences, p_secoes, p_grupos)`.
- `tmp_product_forecast` (cálculo de MIN/AVG/MAX/COUNT por `prod_code`)
  fica igual.
- Result set 1 perde o `WHERE occurrences >= p_min_occurrences`: agora
  seleciona TODO produto de `tmp_product_forecast`, sem filtro por
  ocorrência.
- Result set 2 ("outros", `GROUP BY secao, grupo, subgrupo`) é
  **removido inteiramente** — nada mais para agregar.
- Result set 3 (lista de seções) e o predicado de filtro secao/grupo
  ficam iguais.
- Result set final (metadata) perde `p_min_occurrences AS min_occurrences`,
  fica só `weekday_num`, `lookback_occurrences`.

`scripts/bench-procs.sh`: os 2 cenários de `production_forecast`
(linhas ~199-200) e os 2 novos temporários da candidata perdem o
argumento `4` (min_occurrences) da chamada `CALL`.

## 2. Tipos (`src/lib/api-types.ts`)

- `ProductionOutrosBucket` removido.
- `ProductionSecaoForecast` perde `outrosBySubgrupo`, fica só
  `{ secao, produtos: ProductionForecastProduct[], totalSecao }`.
- `ProductionForecastResult` perde `minOccurrences`.

## 3. `src/lib/production.functions.ts`

- `PRODUCTION_MIN_OCCURRENCES` removido.
- `CALL production_forecast(?, ?, ?, ?, ?)` (5 parâmetros).
- Destructuring de `rs` vira `[individualRows, secoesRows, metaRows]`
  (3 result sets, não mais 4).
- Remove a construção de `outrosBySecao` inteira.
- Mapeamento de `secoes` fica só com `produtos`/`totalSecao` (sem
  outros pra somar).

## 4. `src/lib/production-filter.ts`

- `OUTROS_CAVEAT_TEXT` e `mergeOutros` removidos.
- `computeVisibleSecoes` simplifica: sem `outrosBySubgrupo` pra tocar,
  o filtro de subgrupo e de produto operam só sobre `produtos`.

## 5. `src/components/production-table.tsx` e `src/hooks/use-production-pdf-export.ts`

- Bloco de renderização/impressão da linha "Outros" (com o asterisco e
  a nota de rodapé no PDF) removido inteiramente.
- Comentário desatualizado sobre volume de linhas em
  `production-table.tsx` ajustado pra não prometer "bem abaixo da
  AreaTable" (já não é bem assim com ~3396 linhas possíveis).

## 6. `src/routes/_authenticated/forecast.page.tsx`

- `minOccurrences` sai da chamada de `useProductionPdfExport`.
- Legenda da tela e do PDF ("Baseado nas últimas N ocorrências deste
  dia da semana (mínimo de M vendas para entrar individualmente).")
  perde a segunda oração — não existe mais piso: "Baseado nas últimas N
  ocorrências deste dia da semana."

## 7. Testes

- `production.functions.test.ts`: fixture do proc mock perde
  `outros`/`min_occurrences`; testes de "outros" (subgrupo só com
  outros, etc.) removidos ou reescritos como "produto com 1 ocorrência
  aparece individual, mín=média=máx".
- `production-filter.test.ts`: remove testes de `mergeOutros`/outros no
  `computeVisibleSecoes`.
- `production-table.test.tsx`: remove testes da linha "Outros"
  (ressalva, drop ao filtrar).
- `use-production-pdf-export.test.ts`: remove testes da linha
  "Outros"/footnote.

## Verificação

- `bun run lint && bun run typecheck && bun run test`.
- `scripts/bench-procs.sh` antes/depois da candidata v4, comparar com
  a baseline v3 (281ms sem filtro / 226ms com filtro) — esperado igual
  ou melhor, já que remove um `GROUP BY` inteiro; registrar em
  `docs/medicao-performance.md` antes de renomear pro nome definitivo.
- Navegador local (skill `run`): loja 1516, conferir que não existe
  mais nenhuma linha "Outros" em lugar nenhum, que um produto com
  poucas vendas aparece como linha normal com PLU/nome/mín=média=máx
  (quando só 1 ocorrência), gerar o PDF de novo e confirmar o mesmo lá.
