import type { ProductionForecastProduct, ProductionSecaoForecast } from "@/lib/api-types";

/** Shown next to an "Outros" aggregate row (screen and PDF, same string on
 * purpose) -- it has no individual PLU because the proc only returns the
 * aggregate for products below PRODUCTION_MIN_OCCURRENCES, not because the
 * data is being hidden. */
export const OUTROS_CAVEAT_TEXT =
  "poucas vendas no período (abaixo do mínimo de confiança pra estimativa individual)";

export interface VisibleSecoesResult {
  visibleSecoes: ProductionSecaoForecast[];
  totalGeral: number;
}

/**
 * Narrows the Seção → Grupo → Subgrupo tree to the selected products and/or
 * subgrupos, and recomputes every level's total from just what's left --
 * shared by ProductionTable (screen) and useProductionPdfExport (PDF), so
 * the two can never disagree on what "filtered" means.
 *
 * Picking specific products/subgrupos is a deliberate scope narrowing the
 * user asked for -- unlike the confidence-floor "every seção always shows"
 * rule (which is about not hiding data for statistical sparsity), a branch
 * with nothing left is allowed to disappear at any level. A subgrupo
 * filter keeps a subgrupo's "outros" as-is (every outros bucket already
 * belongs to exactly one subgrupo, so the match is well-defined); a
 * product filter drops "outros" instead (no PLU to match against an
 * aggregate) and recomputes totals bottom-up from just the visible rows.
 */
export function computeVisibleSecoes(
  secoes: ProductionSecaoForecast[],
  productFilter?: string[],
  subgrupoFilter?: string[],
): VisibleSecoesResult {
  const selectedProdutos =
    productFilter && productFilter.length > 0 ? new Set(productFilter) : null;
  const selectedSubgrupos =
    subgrupoFilter && subgrupoFilter.length > 0 ? new Set(subgrupoFilter) : null;

  if (!selectedProdutos && !selectedSubgrupos) {
    const totalGeral = secoes.reduce((sum, s) => sum + s.totalSecao, 0);
    return { visibleSecoes: secoes, totalGeral };
  }

  const visibleSecoes = secoes
    .map((s) => {
      const grupos = s.grupos
        .map((g) => {
          const subgrupos = g.subgrupos
            .filter(
              (sg) =>
                !selectedSubgrupos || (sg.subgrupo !== null && selectedSubgrupos.has(sg.subgrupo)),
            )
            .map((sg) => {
              if (!selectedProdutos) return sg;
              const produtos = sg.produtos.filter((p) => selectedProdutos.has(p.prodCode));
              const totalSubgrupo = produtos.reduce((sum, p) => sum + p.forecastVal, 0);
              return { ...sg, produtos, outros: null, totalSubgrupo };
            })
            .filter((sg) => sg.produtos.length > 0 || sg.outros !== null);
          const totalGrupo = subgrupos.reduce((sum, sg) => sum + sg.totalSubgrupo, 0);
          return { ...g, subgrupos, totalGrupo };
        })
        .filter((g) => g.subgrupos.length > 0);
      const totalSecao = grupos.reduce((sum, g) => sum + g.totalGrupo, 0);
      return { ...s, grupos, totalSecao };
    })
    .filter((s) => s.grupos.length > 0);

  const totalGeral = visibleSecoes.reduce((sum, s) => sum + s.totalSecao, 0);
  return { visibleSecoes, totalGeral };
}

export interface FlattenedSecaoRows {
  produtos: ProductionForecastProduct[];
  outros: { numProdutos: number; outrosVal: number } | null;
}

/**
 * Collapses a seção's Grupo → Subgrupo tree into a single ordered product
 * list (screen and PDF show only the leaf product, not the intermediate
 * headers) while keeping the secao/grupo/subgrupo/valor order the proc
 * already returns things in -- a plain traversal preserves it for free.
 * "Outros" buckets are merged back into one per seção (mirrors the
 * pre-Grupo/Subgrupo table, just computed from richer, per-subgrupo data).
 */
export function flattenSecaoRows(secao: ProductionSecaoForecast): FlattenedSecaoRows {
  const produtos: ProductionForecastProduct[] = [];
  let numProdutos = 0;
  let outrosVal = 0;
  for (const g of secao.grupos) {
    for (const sg of g.subgrupos) {
      produtos.push(...sg.produtos);
      if (sg.outros) {
        numProdutos += sg.outros.numProdutos;
        outrosVal += sg.outros.outrosVal;
      }
    }
  }
  return { produtos, outros: numProdutos > 0 ? { numProdutos, outrosVal } : null };
}
