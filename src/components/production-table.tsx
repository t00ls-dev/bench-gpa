import { useMemo } from "react";
import { fmtBRL } from "@/lib/utils";
import type { ProductionSecaoForecast } from "@/lib/api-types";
import { computeVisibleSecoes } from "@/lib/production-filter";
import { Button } from "@/components/ui/button";
import { FileText, Loader2 } from "lucide-react";

/**
 * No virtualization here on purpose: the row count is every individual
 * product of PERECIVEIS at ONE store that sold at least once in the
 * lookback window, which can run into the low thousands for a busy store
 * -- if that ever becomes a real UX problem, virtualizing is the fix, not
 * hiding rows again.
 *
 * Each product already carries its own grupo/subgrupo (used by the
 * Subgrupo filter and to keep the list in secao/grupo/subgrupo/valor
 * order), but the table renders flat rows only, without section or
 * subgroup headers.
 */
export function ProductionTable({
  secoes,
  isFetching,
  productFilter,
  subgrupoFilter,
  onExportPDF,
  pdfLoading,
  pdfElapsed,
}: {
  secoes: ProductionSecaoForecast[];
  isFetching: boolean;
  productFilter?: string[];
  subgrupoFilter?: string[];
  onExportPDF?: () => void;
  pdfLoading?: boolean;
  pdfElapsed?: number;
}) {
  // Memoized so a re-render that only ticks pdfElapsed (once a second while
  // the PDF is generating) doesn't redo the filter/reduce pass over secoes.
  const { visibleSecoes, totalGeral } = useMemo(
    () => computeVisibleSecoes(secoes, productFilter, subgrupoFilter),
    [secoes, productFilter, subgrupoFilter],
  );
  const visibleProducts = useMemo(() => visibleSecoes.flatMap((s) => s.produtos), [visibleSecoes]);

  return (
    <div className="kpi-card overflow-hidden">
      <div className="flex items-center justify-between border-b px-3 py-2">
        <span className="text-sm font-medium">Produtos da previsão</span>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-2 text-sm font-semibold">
            {isFetching && <Loader2 className="size-3.5 animate-spin text-muted-foreground" />}
            Total: {fmtBRL(totalGeral)}
          </span>
          {onExportPDF && secoes.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={onExportPDF}
              className="h-9 shrink-0"
              disabled={pdfLoading}
              title="Exporta o planejamento filtrado em PDF, com campo em branco pra anotar a quantidade produzida"
              aria-label="Exportar planejamento em PDF"
            >
              {pdfLoading ? (
                <Loader2 className="mr-1.5 size-4 animate-spin" />
              ) : (
                <FileText className="mr-1.5 size-4" />
              )}{" "}
              {pdfLoading ? `Gerando… ${pdfElapsed ?? 0}s` : "PDF"}
            </Button>
          )}
        </div>
      </div>

      {secoes.length === 0 && !isFetching && (
        <p className="px-3 py-6 text-center text-sm text-muted-foreground">
          Nenhuma seção de Perecíveis encontrada para esta loja.
        </p>
      )}

      {secoes.length > 0 && visibleProducts.length === 0 && (
        <p className="px-3 py-6 text-center text-sm text-muted-foreground">
          Nenhum produto encontrado para os filtros selecionados.
        </p>
      )}

      <div className="overflow-auto -mx-3 px-3 sm:mx-0 sm:px-0">
        <div className="min-w-[640px] text-sm">
          <div className="grid grid-cols-[16%_44%_13%_13%_14%] border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
            <div className="py-2 px-3">PLU</div>
            <div className="py-2 px-3">Produto</div>
            <div className="py-2 px-3 text-right">Mín</div>
            <div className="py-2 px-3 text-right">Méd</div>
            <div className="py-2 px-3 text-right">Máx</div>
          </div>
          <div>
            {visibleProducts.map((p) => (
              <div
                key={p.prodCode}
                className="grid grid-cols-[16%_44%_13%_13%_14%] items-center border-b border-border/60 hover:bg-muted/40"
                title={`PLU ${p.prodCode} · ${p.prodName}`}
              >
                <div className="self-center font-mono text-xs px-3 whitespace-nowrap">
                  {p.prodCode}
                </div>
                <div className="self-center px-3 whitespace-nowrap">{p.prodName}</div>
                <div className="self-center px-3 text-right whitespace-nowrap">
                  {fmtBRL(p.forecastMin)}
                </div>
                <div className="self-center px-3 text-right whitespace-nowrap font-medium">
                  {fmtBRL(p.forecastVal)}
                </div>
                <div className="self-center px-3 text-right whitespace-nowrap">
                  {fmtBRL(p.forecastMax)}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
