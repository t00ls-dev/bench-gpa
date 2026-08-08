import { Fragment } from "react";
import { fmtBRL } from "@/lib/utils";
import type { ProductionSecaoForecast } from "@/lib/api-types";
import { computeVisibleSecoes, OUTROS_CAVEAT_TEXT } from "@/lib/production-filter";
import { Button } from "@/components/ui/button";
import { FileText, Loader2 } from "lucide-react";

/**
 * First component in this project to render grouped rows with a subtotal
 * (AreaTable is a flat virtualized list). No virtualization here on
 * purpose: the row count is the number of individual products of
 * PERECIVEIS at ONE store, dozens to a few hundred rows, well below
 * AreaTable's volume.
 *
 * Nested Seção → Grupo → Subgrupo → produtos, each level with its own
 * header/subtotal (increasing indent/decreasing emphasis). Unlike Seção
 * (always shown, even with nothing this weekday -- padded from the full
 * catalog in production.functions.ts), a Grupo/Subgrupo branch only exists
 * here when it actually has a product or an "outros" aggregate: nothing
 * pads them from the catalog, so there's no empty-branch case to hide.
 */
export function ProductionTable({
  secoes,
  isFetching,
  productFilter,
  onExportPDF,
  pdfLoading,
  pdfElapsed,
}: {
  secoes: ProductionSecaoForecast[];
  isFetching: boolean;
  productFilter?: string[];
  onExportPDF?: () => void;
  pdfLoading?: boolean;
  pdfElapsed?: number;
}) {
  const { visibleSecoes, totalGeral } = computeVisibleSecoes(secoes, productFilter);

  return (
    <div className="kpi-card overflow-hidden">
      <div className="flex items-center justify-between border-b px-3 py-2">
        <span className="text-sm font-medium">Venda esperada por seção</span>
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
            {s.grupos.map((g) => (
              <Fragment key={`${s.secao}|${g.grupo ?? ""}`}>
                <div className="flex items-center justify-between bg-muted/20 py-1 pr-3 pl-5">
                  <span className="text-xs font-medium">{g.grupo ?? "Sem grupo"}</span>
                  <span className="text-xs font-medium">{fmtBRL(g.totalGrupo)}</span>
                </div>
                {g.subgrupos.map((sg) => (
                  <Fragment key={`${s.secao}|${g.grupo ?? ""}|${sg.subgrupo ?? ""}`}>
                    <div className="flex items-center justify-between py-1 pr-3 pl-7">
                      <span className="text-xs font-medium text-muted-foreground">
                        {sg.subgrupo ?? "Sem subgrupo"}
                      </span>
                      <span className="text-xs font-medium text-muted-foreground">
                        {fmtBRL(sg.totalSubgrupo)}
                      </span>
                    </div>
                    {sg.produtos.map((p) => (
                      <div
                        key={p.prodCode}
                        className="grid grid-cols-[1fr_auto] items-center gap-3 py-1.5 pr-3 pl-9 text-sm"
                      >
                        <span className="truncate" title={`PLU ${p.prodCode} · ${p.prodName}`}>
                          <span className="text-muted-foreground">PLU {p.prodCode}</span> ·{" "}
                          {p.prodName}
                        </span>
                        <span className="text-right whitespace-nowrap">
                          <span className="block font-medium">{fmtBRL(p.forecastVal)}</span>
                          <span className="block text-xs text-muted-foreground">
                            mín {fmtBRL(p.forecastMin)} / máx {fmtBRL(p.forecastMax)}
                          </span>
                        </span>
                      </div>
                    ))}
                    {sg.outros && (
                      <div className="grid grid-cols-[1fr_auto] items-center gap-3 py-1.5 pr-3 pl-9 text-sm text-muted-foreground italic">
                        <span>
                          <span className="block">
                            Outros produtos com histórico no dia ({sg.outros.numProdutos})
                          </span>
                          <span className="block text-xs">{OUTROS_CAVEAT_TEXT}</span>
                        </span>
                        <span className="whitespace-nowrap">{fmtBRL(sg.outros.outrosVal)}</span>
                      </div>
                    )}
                  </Fragment>
                ))}
              </Fragment>
            ))}
          </Fragment>
        ))}
      </div>
    </div>
  );
}
