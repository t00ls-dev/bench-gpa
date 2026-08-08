import type { ProductionSecaoForecast } from "@/lib/api-types";

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
 * Narrows the Seção → Grupo → Subgrupo tree to the selected products
 * (client-side, exact PLU match) and recomputes every level's total from
 * just what's left -- shared by ProductionTable (screen) and
 * useProductionPdfExport (PDF), so the two can never disagree on what
 * "filtered" means.
 *
 * Picking specific products is a deliberate scope narrowing the user asked
 * for -- unlike the confidence-floor "every seção always shows" rule (which
 * is about not hiding data for statistical sparsity), a branch with zero
 * selected products is allowed to disappear at any level. "Outros" has no
 * per-product identity to select, so it's excluded (not just hidden) while
 * a selection is active: every total is recomputed bottom-up from just the
 * visible rows, so the numbers always add up to what's actually shown,
 * instead of a stale total that includes filtered-out data.
 */
export function computeVisibleSecoes(
  secoes: ProductionSecaoForecast[],
  productFilter?: string[],
): VisibleSecoesResult {
  const selected = productFilter && productFilter.length > 0 ? new Set(productFilter) : null;
  if (!selected) {
    const totalGeral = secoes.reduce((sum, s) => sum + s.totalSecao, 0);
    return { visibleSecoes: secoes, totalGeral };
  }

  const visibleSecoes = secoes
    .map((s) => {
      const grupos = s.grupos
        .map((g) => {
          const subgrupos = g.subgrupos
            .map((sg) => {
              const produtos = sg.produtos.filter((p) => selected.has(p.prodCode));
              const totalSubgrupo = produtos.reduce((sum, p) => sum + p.forecastVal, 0);
              return { ...sg, produtos, outros: null, totalSubgrupo };
            })
            .filter((sg) => sg.produtos.length > 0);
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
