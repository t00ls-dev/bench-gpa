import type { ProductionSecaoForecast } from "@/lib/api-types";

/** Shown next to the "Outros" aggregate row (screen and PDF, same string on
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
 * Narrows `secoes` to the selected products (client-side, exact PLU match)
 * and recomputes totals from just what's left -- shared by ProductionTable
 * (screen) and useProductionPdfExport (PDF), so the two can never disagree
 * on what "filtered" means.
 *
 * Picking specific products is a deliberate scope narrowing the user asked
 * for -- unlike the confidence-floor "every seção always shows" rule (which
 * is about not hiding data for statistical sparsity), a seção with zero
 * selected products is allowed to disappear. "Outros" has no per-product
 * identity to select, so it's excluded (not just hidden) while a selection
 * is active: totalSecao/totalGeral are recomputed from just the visible
 * rows, so the numbers always add up to what's actually shown, instead of a
 * stale total that includes filtered-out data.
 */
export function computeVisibleSecoes(
  secoes: ProductionSecaoForecast[],
  productFilter?: string[],
): VisibleSecoesResult {
  const selected = productFilter && productFilter.length > 0 ? new Set(productFilter) : null;
  const visibleSecoes = selected
    ? secoes
        .map((s) => {
          const produtos = s.produtos.filter((p) => selected.has(p.prodCode));
          return {
            ...s,
            produtos,
            outrosVal: 0,
            outrosNumProdutos: 0,
            totalSecao: produtos.reduce((sum, p) => sum + p.forecastVal, 0),
          };
        })
        .filter((s) => s.produtos.length > 0)
    : secoes;
  const totalGeral = visibleSecoes.reduce((sum, s) => sum + s.totalSecao, 0);
  return { visibleSecoes, totalGeral };
}
