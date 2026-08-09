import type { ProductionOutrosBucket, ProductionSecaoForecast } from "@/lib/api-types";

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
 * Narrows each seção's products and outros buckets to the selected
 * products and/or subgrupos, and recomputes `totalSecao` from just what's
 * left -- shared by ProductionTable (screen) and useProductionPdfExport
 * (PDF), so the two can never disagree on what "filtered" means.
 *
 * Picking specific products/subgrupos is a deliberate scope narrowing the
 * user asked for -- unlike the confidence-floor "every seção always shows"
 * rule (which is about not hiding data for statistical sparsity), a seção
 * with nothing left is allowed to disappear. A subgrupo filter keeps the
 * matching outros buckets as-is (each one is already tagged with its own
 * grupo/subgrupo, so the match is well-defined); a product filter drops
 * every outros bucket instead (no PLU to match against an aggregate).
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
      let produtos = s.produtos;
      let outrosBySubgrupo = s.outrosBySubgrupo;
      if (selectedSubgrupos) {
        produtos = produtos.filter((p) => p.subgrupo !== null && selectedSubgrupos.has(p.subgrupo));
        outrosBySubgrupo = outrosBySubgrupo.filter(
          (o) => o.subgrupo !== null && selectedSubgrupos.has(o.subgrupo),
        );
      }
      if (selectedProdutos) {
        produtos = produtos.filter((p) => selectedProdutos.has(p.prodCode));
        outrosBySubgrupo = [];
      }
      const totalSecao =
        produtos.reduce((sum, p) => sum + p.forecastVal, 0) +
        outrosBySubgrupo.reduce((sum, o) => sum + o.outrosVal, 0);
      return { ...s, produtos, outrosBySubgrupo, totalSecao };
    })
    .filter((s) => s.produtos.length > 0 || s.outrosBySubgrupo.length > 0);

  const totalGeral = visibleSecoes.reduce((sum, s) => sum + s.totalSecao, 0);
  return { visibleSecoes, totalGeral };
}

export interface MergedOutros {
  numProdutos: number;
  outrosVal: number;
}

/** Screen and PDF both show one merged "outros" line per seção, not one per
 * subgrupo -- sums whatever outros buckets are currently visible. */
export function mergeOutros(outrosBySubgrupo: ProductionOutrosBucket[]): MergedOutros | null {
  if (outrosBySubgrupo.length === 0) return null;
  return outrosBySubgrupo.reduce(
    (acc, o) => ({
      numProdutos: acc.numProdutos + o.numProdutos,
      outrosVal: acc.outrosVal + o.outrosVal,
    }),
    { numProdutos: 0, outrosVal: 0 },
  );
}
