import { useState } from "react";
import { format } from "date-fns";
import type { CellInput } from "jspdf-autotable";
import { fmtBRL, fmtBRShort } from "@/lib/utils";
import { openPdfBlob, slugifyFilename } from "@/lib/export-pdf";
import { useElapsedSeconds } from "@/hooks/use-elapsed-seconds";
import { computeVisibleSecoes, OUTROS_CAVEAT_TEXT } from "@/lib/production-filter";
import type { ProductionSecaoForecast } from "@/lib/api-types";

interface Params {
  secoes: ProductionSecaoForecast[];
  productFilter: string[];
  storeLabel: string;
  targetDate: string;
  lookbackOccurrences: number;
  minOccurrences: number;
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
  storeLabel,
  targetDate,
  lookbackOccurrences,
  minOccurrences,
}: Params) {
  const [pdfLoading, setPdfLoading] = useState(false);
  const pdfElapsed = useElapsedSeconds(pdfLoading);

  const openPdfInNewTab = async () => {
    setPdfLoading(true);
    try {
      const { visibleSecoes, totalGeral } = computeVisibleSecoes(secoes, productFilter);

      const jsPDF = (await import("jspdf")).default;
      const autoTable = (await import("jspdf-autotable")).default;
      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const mX = 10;

      doc.setFont("helvetica", "bold");
      doc.setFontSize(14);
      doc.setTextColor(17, 17, 17);
      doc.text("Planejamento de Produção", mX, 12);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(85, 85, 85);
      doc.text("Loja: " + storeLabel, mX, 18);
      doc.text("Dia: " + fmtBRShort(targetDate), mX, 22.5);
      doc.text(
        `Baseado nas últimas ${lookbackOccurrences} ocorrências deste dia da semana ` +
          `(mínimo de ${minOccurrences} vendas para entrar individualmente).`,
        mX,
        27,
      );
      doc.text("Total geral: " + fmtBRL(totalGeral), mX, 31.5);

      // Every row a plain string tuple, except a seção header (a single
      // colSpan:6 cell) and an "outros" row (individually styled cells) --
      // outrosRowIndices tracks which body index needs the italic/gray
      // styling, since a row's own content can't be trusted to identify it
      // (a real product could coincidentally have an empty PLU/name).
      const body: Row[] = [];
      const outrosRowIndices = new Set<number>();
      let hasOutros = false;

      for (const s of visibleSecoes) {
        body.push([
          {
            content: `${s.secao} — Total: ${fmtBRL(s.totalSecao)}`,
            colSpan: 6,
            styles: { fillColor: [238, 238, 238], fontStyle: "bold", halign: "left" },
          },
        ]);
        for (const p of s.produtos) {
          body.push([
            p.prodCode,
            p.prodName,
            fmtBRL(p.forecastMin),
            fmtBRL(p.forecastVal),
            fmtBRL(p.forecastMax),
            "",
          ]);
        }
        if (s.outrosNumProdutos > 0) {
          hasOutros = true;
          outrosRowIndices.add(body.length);
          body.push([
            "",
            `Outros produtos (${s.outrosNumProdutos})*`,
            "-",
            fmtBRL(s.outrosVal),
            "-",
            "-",
          ]);
        }
      }

      autoTable(doc, {
        startY: 35,
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
          // "QTD PRODUZIDA" doesn't fit that column's width on one line at
          // this font size -- overrides the body's overflow:"hidden" (set
          // per-column below) so the header wraps to two lines instead of
          // being silently clipped.
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
        didParseCell: (h) => {
          if (h.section === "body" && outrosRowIndices.has(h.row.index)) {
            h.cell.styles.fontStyle = "italic";
            h.cell.styles.textColor = [102, 102, 102];
          }
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

      if (hasOutros) {
        const endY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
        doc.setFontSize(7);
        doc.setTextColor(102, 102, 102);
        doc.text(`* Outros produtos: ${OUTROS_CAVEAT_TEXT}.`, mX, endY + 5);
      }

      const timestamp = format(new Date(), "yyyyMMdd-HHmmss");
      const filename = `planejamento-producao-${slugifyFilename(storeLabel)}-${targetDate}-${timestamp}.pdf`;
      await openPdfBlob(doc, filename);
    } finally {
      setPdfLoading(false);
    }
  };

  return { pdfLoading, pdfElapsed, openPdfInNewTab };
}
