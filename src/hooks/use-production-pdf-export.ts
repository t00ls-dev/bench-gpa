import { useState } from "react";
import { format } from "date-fns";
import type { CellInput } from "jspdf-autotable";
import { fmtBRL, fmtBRShort } from "@/lib/utils";
import { openPdfBlob, slugifyFilename } from "@/lib/export-pdf";
import { useElapsedSeconds } from "@/hooks/use-elapsed-seconds";
import { computeVisibleSecoes } from "@/lib/production-filter";
import type { ProductionForecastProduct, ProductionSecaoForecast } from "@/lib/api-types";

interface Params {
  secoes: ProductionSecaoForecast[];
  productFilter: string[];
  subgrupoFilter: string[];
  storeLabel: string;
  targetDate: string;
  lookbackOccurrences: number;
  visibleProducts?: ProductionForecastProduct[];
}

type Row = CellInput[];

/**
 * PDF export for the Forecast screen, same delivery mechanism as
 * useAreaPdfExport (src/hooks/use-area-pdf-export.ts) but simpler:
 * getProductionForecast already returns the whole day's forecast for the
 * store in one shot (no EXPORT_PAGE_SIZE-style pagination), so there's no
 * extra server round-trip here -- it just formats whatever `secoes` the
 * page already has loaded, filtered the same way the screen is (via
 * computeVisibleSecoes, shared with ProductionTable).
 *
 * The last column (QTD PRODUZIDA) is always left blank on purpose: it's
 * meant to be filled in by hand after printing, comparing what was
 * actually produced against the forecast.
 */
export function useProductionPdfExport({
  secoes,
  productFilter,
  subgrupoFilter,
  storeLabel,
  targetDate,
  lookbackOccurrences,
  visibleProducts,
}: Params) {
  const [pdfLoading, setPdfLoading] = useState(false);
  const pdfElapsed = useElapsedSeconds(pdfLoading);

  const openPdfInNewTab = async (products = visibleProducts) => {
    setPdfLoading(true);
    try {
      const fallback = computeVisibleSecoes(secoes, productFilter, subgrupoFilter);
      const rows = products ?? fallback.visibleSecoes.flatMap((section) => section.produtos);

      // Independent chunks -- fetched/parsed concurrently instead of one
      // after another.
      const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
        import("jspdf"),
        import("jspdf-autotable"),
      ]);
      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const mX = 10;

      doc.setFont("helvetica", "bold");
      doc.setFontSize(14);
      doc.setTextColor(17, 17, 17);
      doc.text("Previsão de Venda", mX, 12);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(85, 85, 85);
      doc.text("Loja: " + storeLabel, mX, 18);
      doc.text("Dia: " + fmtBRShort(targetDate), mX, 22.5);
      doc.text(
        `Baseado nas últimas ${lookbackOccurrences} ocorrências deste dia da semana.`,
        mX,
        27,
      );

      // Flat rows only, matching the on-screen table. The exported PDF is
      // just the filtered product list with min/med/max columns.
      const body: Row[] = [];
      for (const p of rows) {
        body.push([
          p.prodCode,
          p.prodName,
          fmtBRL(p.forecastMin),
          fmtBRL(p.forecastVal),
          fmtBRL(p.forecastMax),
          "",
        ]);
      }

      autoTable(doc, {
        startY: 31.5,
        margin: { left: mX, right: mX },
        head: [["PLU", "PRODUTO", "MÍN", "MÉDIA", "MÁX", "QTD PRODUZIDA"]],
        body: body.length ? body : [["", "Nenhum produto.", "", "", "", ""]],
        theme: "grid",
        styles: {
          font: "helvetica",
          fontSize: 8,
          cellPadding: 1.5,
          overflow: "hidden",
          valign: "middle",
          lineColor: [153, 153, 153],
          lineWidth: 0.1,
          textColor: [17, 17, 17],
        },
        headStyles: {
          fillColor: [238, 238, 255],
          textColor: [17, 17, 17],
          fontStyle: "bold",
          fontSize: 8,
          halign: "center",
          overflow: "linebreak",
        },
        columnStyles: {
          0: { cellWidth: 16 },
          1: { cellWidth: 74, overflow: "hidden" },
          2: { cellWidth: 20, halign: "right" },
          3: { cellWidth: 22, halign: "right" },
          4: { cellWidth: 20, halign: "right" },
          5: { cellWidth: 28 },
        },
        willDrawCell: (h) => {
          if (h.section === "body" && h.column.index === 1) {
            const raw = Array.isArray(h.cell.text)
              ? h.cell.text.join(" ")
              : String(h.cell.text ?? "");
            const maxW = h.cell.width - h.cell.padding("horizontal");
            let t = raw;
            if (h.doc.getTextWidth(t) > maxW) {
              while (t.length > 1 && h.doc.getTextWidth(t + "...") > maxW) t = t.slice(0, -1);
              t = t.trimEnd() + "...";
            }
            h.cell.text = [t];
          }
        },
      });

      const timestamp = format(new Date(), "yyyyMMdd-HHmmss");
      const filename = `previsao-venda-${slugifyFilename(storeLabel)}-${targetDate}-${timestamp}.pdf`;
      await openPdfBlob(doc, filename);
    } finally {
      setPdfLoading(false);
    }
  };

  return { pdfLoading, pdfElapsed, openPdfInNewTab };
}
