import { Fragment } from "react";
import { fmtBRL } from "@/lib/utils";
import type { ProductionSecaoForecast } from "@/lib/api-types";
import { Loader2 } from "lucide-react";

/**
 * First component in this project to render grouped rows with a subtotal
 * (AreaTable is a flat virtualized list). No virtualization here on
 * purpose: the row count is the number of individual products of
 * PERECIVEIS at ONE store, dozens to a few hundred rows, well below
 * AreaTable's volume.
 */
export function ProductionTable({
  secoes,
  isFetching,
  productFilter,
}: {
  secoes: ProductionSecaoForecast[];
  isFetching: boolean;
  productFilter?: string[];
}) {
  const selected = productFilter && productFilter.length > 0 ? new Set(productFilter) : null;
  // Picking specific products is a deliberate scope narrowing the user
  // asked for -- unlike the confidence-floor "every seção always shows"
  // rule (which is about not hiding data for statistical sparsity), a
  // seção with zero selected products is allowed to disappear. "Outros" has
  // no per-product identity to select, so it's excluded (not just hidden)
  // while a selection is active: totalSecao/totalGeral are recomputed from
  // just the visible rows, so the numbers on screen always add up to what's
  // actually shown, instead of a stale total that includes filtered-out data.
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

  return (
    <div className="kpi-card overflow-hidden">
      <div className="flex items-center justify-between border-b px-3 py-2">
        <span className="text-sm font-medium">Venda esperada por seção</span>
        <span className="flex items-center gap-2 text-sm font-semibold">
          {isFetching && <Loader2 className="size-3.5 animate-spin text-muted-foreground" />}
          Total: {fmtBRL(totalGeral)}
        </span>
      </div>

      {secoes.length === 0 && !isFetching && (
        <p className="px-3 py-6 text-center text-sm text-muted-foreground">
          Nenhuma seção de Perecíveis encontrada para esta loja.
        </p>
      )}

      {secoes.length > 0 && visibleSecoes.length === 0 && (
        <p className="px-3 py-6 text-center text-sm text-muted-foreground">
          Nenhum produto encontrado para os produtos selecionados.
        </p>
      )}

      <div className="divide-y">
        {visibleSecoes.map((s) => (
          <Fragment key={s.secao}>
            <div className="flex items-center justify-between bg-muted/40 px-3 py-1.5">
              <span className="text-xs font-semibold uppercase tracking-wide">{s.secao}</span>
              <span className="text-xs font-semibold">{fmtBRL(s.totalSecao)}</span>
            </div>
            {s.produtos.map((p) => (
              <div
                key={p.prodCode}
                className="grid grid-cols-[1fr_auto] items-center gap-3 px-3 py-1.5 text-sm"
              >
                <span className="truncate" title={`PLU ${p.prodCode} · ${p.prodName}`}>
                  <span className="text-muted-foreground">PLU {p.prodCode}</span> · {p.prodName}
                </span>
                <span className="text-right whitespace-nowrap">
                  <span className="block font-medium">{fmtBRL(p.forecastVal)}</span>
                  <span className="block text-xs text-muted-foreground">
                    mín {fmtBRL(p.forecastMin)} / máx {fmtBRL(p.forecastMax)}
                  </span>
                </span>
              </div>
            ))}
            {s.outrosNumProdutos > 0 && (
              <div className="grid grid-cols-[1fr_auto] items-center gap-3 px-3 py-1.5 text-sm text-muted-foreground italic">
                <span>Outros produtos com histórico no dia ({s.outrosNumProdutos})</span>
                <span className="whitespace-nowrap">{fmtBRL(s.outrosVal)}</span>
              </div>
            )}
          </Fragment>
        ))}
      </div>
    </div>
  );
}
