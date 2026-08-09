import type { ProductionSecaoForecast } from "@/lib/api-types";

export interface VisibleSecoesResult {
  visibleSecoes: ProductionSecaoForecast[];
  totalGeral: number;
}

/**
 * Narrows each seção's products to the selected products and/or
 * subgrupos, and recomputes `totalSecao` from just what's left -- shared
 * by ProductionTable (screen) and useProductionPdfExport (PDF), so the two
 * can never disagree on what "filtered" means.
 *
 * Picking specific products/subgrupos is a deliberate scope narrowing the
 * user asked for -- unlike the confidence-floor "every seção always shows"
 * rule (which is about not hiding data for statistical sparsity), a seção
 * with nothing left is allowed to disappear.
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
      if (selectedSubgrupos) {
        produtos = produtos.filter((p) => p.subgrupo !== null && selectedSubgrupos.has(p.subgrupo));
      }
      if (selectedProdutos) {
        produtos = produtos.filter((p) => selectedProdutos.has(p.prodCode));
      }
      const totalSecao = produtos.reduce((sum, p) => sum + p.forecastVal, 0);
      return { ...s, produtos, totalSecao };
    })
    .filter((s) => s.produtos.length > 0);

  const totalGeral = visibleSecoes.reduce((sum, s) => sum + s.totalSecao, 0);
  return { visibleSecoes, totalGeral };
}
