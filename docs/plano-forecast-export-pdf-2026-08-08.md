# Export PDF — Planejamento de Produção (Forecast)

## Contexto

A tela `/forecast` (Planejamento de Produção) já mostra, por loja/dia, a
venda esperada por produto de Perecíveis (faixa mín/média/máx), agrupada
por seção, com filtros de Seção/Grupo/Produto (PRs #246-248). Falta uma
forma de **imprimir** essa previsão para uso operacional: o time de
produção leva o papel pra loja, produz, e anota à mão a quantidade
realmente produzida ao lado de cada item, pra comparar depois com o
previsto. A Área já tem exatamente esse padrão (PR de PDF export lá:
`useAreaPdfExport` + colunas QTD/VALIDADE em branco) — esta feature
replica o mesmo mecanismo de geração/entrega de PDF, adaptado ao formato
agrupado-por-seção do Forecast, com uma coluna **Quantidade Produzida**
em branco.

Decisões confirmadas com o usuário:
- **Nunca esconder dado por falta de confiança** — a linha agregada
  "Outros produtos" (produtos abaixo do piso de `PRODUCTION_MIN_OCCURRENCES`,
  sem PLU individual porque a proc só devolve o agregado) precisa
  continuar aparecendo sempre, tanto na tela quanto no PDF, com uma
  ressalva textual explicando por que não tem PLU/faixa individual — isso
  vale pra tela também, não só pro PDF (pequeno ajuste em
  `production-table.tsx` além do PDF em si).
- **PDF respeita os filtros já aplicados na tela** (Seção/Grupo/Produto),
  mesmo padrão que a Área já usa com a busca — exporta exatamente o que
  está filtrado/visível no momento do clique, não o dia inteiro sempre.
- **Colunas separadas** MÍN / MÉDIA / MÁX (não uma coluna combinada de texto).

## 1. Extrair a lógica de filtro/reconciliação pra uma função pura

Hoje `visibleSecoes`/`totalGeral` (aplicar `productFilter`, excluir
"outros" enquanto um filtro de produto está ativo, recalcular
`totalSecao`/`totalGeral` a partir só do que ficou visível) vive dentro
de `ProductionTable` (`src/components/production-table.tsx:22-47`). Extrair
para uma função pura nova, `computeVisibleSecoes(secoes, productFilter)`
em `src/lib/production-filter.ts`, retornando `{ visibleSecoes, totalGeral }`.
`ProductionTable` passa a chamar essa função; o novo hook de PDF (passo 3)
chama a mesma função sobre o mesmo `secoes` — garante que tela e PDF nunca
divirjam nessa regra (é literalmente a mesma função). Teste novo,
`src/lib/production-filter.test.ts`, cobrindo os casos hoje testados
indiretamente em `production-table.test.tsx` (mantém os testes de
componente focados em renderização, não duplica a lógica de cálculo).

## 2. Ressalva da linha "Outros" na tela

Em `production-table.tsx`, a linha:
```tsx
<span>Outros produtos com histórico no dia ({s.outrosNumProdutos})</span>
```
ganha uma segunda linha, mesmo padrão visual da faixa mín/máx dos produtos
individuais (`text-xs text-muted-foreground` abaixo do texto principal):
```
Outros produtos com histórico no dia ({s.outrosNumProdutos})
poucas vendas no período (abaixo do mínimo de confiança pra estimativa individual)
```
Nenhuma mudança de comportamento (a linha já aparece sempre que
`outrosNumProdutos > 0` e não há filtro de produto ativo) — só o texto
explicativo, evitando que pareça um "resto descartável" sem contexto.

## 3. Novo hook `use-production-pdf-export.ts`

Em `src/hooks/`, mesmo espírito de `use-area-pdf-export.ts`
(`src/hooks/use-area-pdf-export.ts:33-236`), mas mais simples: o Forecast
já não pagina (`getProductionForecast` devolve o dia inteiro da loja de
uma vez, sem `EXPORT_PAGE_SIZE`), então **não precisa buscar dado
extra do servidor** — usa direto o `data.secoes` já carregado na página,
passado por parâmetro.

```ts
interface Params {
  secoes: ProductionSecaoForecast[]; // data?.secoes ?? []
  productFilter: string[];
  storeCode: string;
  storeLabel: string; // "1516 - LEBLON"
  targetDate: string;
  lookbackOccurrences: number;
  minOccurrences: number;
}
// retorna { pdfLoading, pdfElapsed, openPdfInNewTab }
```

Dentro de `openPdfInNewTab`:
- Chama `computeVisibleSecoes(secoes, productFilter)` (passo 1) — mesma
  função que a tela usa, garante paridade.
- `jsPDF`/`jspdf-autotable` via dynamic import (já são dependências do
  projeto, usadas por `use-area-pdf-export.ts` — sem dependência nova).
- Cabeçalho: título "Planejamento de Produção" (bold 14pt) + linhas
  8pt cinza: `"Loja: " + storeLabel`, `"Dia: " + fmtBRShort(targetDate)`,
  `"Baseado nas últimas N ocorrências deste dia da semana (mínimo de M
  vendas para entrar individualmente)."` (mesmo texto já exibido na tela,
  `forecast.page.tsx:143-146`) e `"Total geral: " + fmtBRL(totalGeral)`.
- **Uma única `autoTable` contínua** (não uma por seção — permite
  paginação natural do jsPDF entre páginas sem cortar uma seção ao meio
  de forma estranha), com o corpo montado manualmente linha a linha:
  - 1 linha de cabeçalho de seção por seção (`colSpan` nas 6 colunas,
    `fillColor` cinza claro, texto `"{secao} — Total: {fmtBRL(totalSecao)}"`).
  - N linhas de produto: `[prodCode, prodName, fmtBRL(min), fmtBRL(médio),
    fmtBRL(max), ""]` (última coluna sempre vazia — é o campo em branco
    pra anotar a quantidade produzida à mão).
  - 1 linha "Outros" quando `outrosNumProdutos > 0` (não aparece se
    `productFilter` estiver ativo, mesma regra da tela): texto
    `"Outros produtos (N)*"` na coluna PRODUTO, valor agregado
    (`outrosVal`) na coluna MÉDIA, `"-"` em MÍN/MÁX/QTD (não há dado
    individual pra essas colunas), itálico/cinza.
  - Rodapé do documento (uma vez, só se alguma seção teve linha
    "Outros"): nota de rodapé explicando o asterisco — mesmo texto da
    ressalva da tela (passo 2), formato `doc.text(...)` numa posição
    fixa após a última tabela.
- Colunas: `["PLU", "PRODUTO", "MÍN", "MÉDIA", "MÁX", "QTD PRODUZIDA"]`,
  larguras fixas (mesmo padrão de `columnStyles` do Área), truncamento de
  nome de produto longo via `willDrawCell` (copiar a lógica de
  `use-area-pdf-export.ts:208-221`, já testada).
- Nome do arquivo: `planejamento-producao-${slugifyFilename(storeLabel)}-${targetDate}-${timestamp}.pdf`
  (mesma função `slugifyFilename`/timestamp de `src/lib/export-pdf.ts`).
- Entrega: `openPdfBlob(doc, filename)` de `src/lib/export-pdf.ts:47-69`,
  **sem nenhuma mudança nesse arquivo nem no backend**
  (`/api/pdf-download` em `src/server.ts`, `pdf-download-store.ts`,
  `content-disposition.ts` já são genéricos, usados como estão).

## 4. Ligar o hook na página e o botão na tabela

`forecast.page.tsx`: chama `useProductionPdfExport({...})` logo depois das
queries, passando `data?.secoes ?? []`, `productFilter`, `storeCode`,
o rótulo da loja (`stores.find(s => s.store_code === storeCode)`),
`targetDate`, `data?.lookbackOccurrences`, `data?.minOccurrences`. Passa
`onExportPDF={openPdfInNewTab}` `pdfLoading` `pdfElapsed` pro
`ProductionTable` (mesmo padrão de `area.page.tsx` → `AreaTable`).

`production-table.tsx`: cabeçalho do card ganha o botão de export ao
lado do "Total: R$ X", mesmo componente/estilo de
`area-table.tsx:176-191` (`Button variant="outline" size="sm"`, ícone
`FileText`/`Loader2`, label `"PDF"` / `` `Gerando… ${pdfElapsed}s` ``,
`disabled={pdfLoading}`). Só aparece quando há dado carregado
(`secoes.length > 0`).

## 5. Testes

- `src/lib/production-filter.test.ts` (novo): a função pura extraída no
  passo 1.
- `src/hooks/use-production-pdf-export.test.ts` (novo, mesmo molde de
  `use-area-pdf-export.test.ts`): nome do arquivo, `pdfLoading`
  liga/desliga, respeita `productFilter` (exclui "outros" quando ativo),
  linha "Outros" aparece com o footnote quando sem filtro.
- `production-table.test.tsx`: atualizar o teste da linha "Outros" pra
  cobrir a nova ressalva; novo teste (ou ajuste) confirmando que o botão
  de export aparece/chama `onExportPDF`.

## Verificação

- `bun run lint && bun run typecheck && bun run test`.
- Navegador local (skill `run`): gerar o PDF de verdade (loja com bastante
  produto, ex. 1516), abrir o arquivo baixado e conferir visualmente:
  cabeçalho (loja/dia/total), colunas MÍN/MÉDIA/MÁX corretas, coluna QTD
  PRODUZIDA em branco em toda linha de produto, linha "Outros" com
  asterisco + nota de rodapé, seções com cabeçalho e subtotal, truncamento
  de nome longo funcionando, paginação entre páginas do PDF sem quebrar
  estranho. Repetir com um filtro de Seção/Produto ativo e confirmar que
  o PDF reflete só o que está filtrado (e que "Outros" some quando o
  filtro de Produto está ativo, igual a tela já faz hoje).
