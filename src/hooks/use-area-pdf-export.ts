import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { format } from "date-fns";
import { getAreaAnalysis } from "@/lib/area.functions";
import { EXPORT_PAGE_SIZE } from "@/lib/schemas";
import { fmtBRL, fmtInt, fmtBRShort } from "@/lib/utils";
import { openPdfBlob, slugifyFilename } from "@/lib/export-pdf";
import { useElapsedSeconds } from "@/hooks/use-elapsed-seconds";
import type { AreaFilters, AreaSortKey } from "@/hooks/use-area-products-view";

interface Params {
  getArea: ReturnType<typeof useServerFn<typeof getAreaAnalysis>>;
  af: AreaFilters;
  search: string;
  sortKey: AreaSortKey;
  sortDir: "asc" | "desc";
  daysSinceLabel: (iso: string | null) => string;
  total: number;
  noSale: number;
  pathParts: string[];
  plusTotal: number;
  plusWithSale: number;
  avgPerPlu: number;
}

/**
 * PDF export for the Area screen, extracted from `area.page.tsx` (technical
 * audit 07/31, "4 responsibilities" item). Fetches the entire listing (not
 * the displayed page) directly from the server, builds the two tables
 * (KPIs + products), and opens the blob in a new tab.
 */
export function useAreaPdfExport({
  getArea,
  af,
  search,
  sortKey,
  sortDir,
  daysSinceLabel,
  total,
  noSale,
  pathParts,
  plusTotal,
  plusWithSale,
  avgPerPlu,
}: Params) {
  const [pdfLoading, setPdfLoading] = useState(false);
  const pdfElapsed = useElapsedSeconds(pdfLoading);

  const {
    dateFrom,
    dateTo,
    stores: fStores,
    deptos: fDeptos,
    secoes: fSecoes,
    grupos: fGrupos,
    subgrupos: fSubgrupos,
  } = af;

  const openPdfInNewTab = async () => {
    setPdfLoading(true);
    try {
      const area = pathParts.join(" › ");
      const allData = await getArea({
        data: {
          dateFrom,
          dateTo,
          stores: fStores,
          deptos: fDeptos,
          secoes: fSecoes,
          grupos: fGrupos,
          subgrupos: fSubgrupos,
          search: search.trim(),
          sortBy: sortKey,
          sortDir,
          page: 1,
          pageSize: EXPORT_PAGE_SIZE,
        },
      });
      const filtered = allData.products ?? [];

      const jsPDF = (await import("jspdf")).default;
      const autoTable = (await import("jspdf-autotable")).default;
      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const mX = 10;

      doc.setFont("helvetica", "bold");
      doc.setFontSize(14);
      doc.setTextColor(17, 17, 17);
      doc.text("Análise de Área", mX, 12);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(85, 85, 85);
      doc.text("Área: " + area, mX, 18);
      doc.text("Período: " + fmtBRShort(dateFrom) + " - " + fmtBRShort(dateTo), mX, 22.5);
      doc.text("Produtos listados: " + filtered.length, mX, 27);

      // Experimental (UX backlog item 6): the same 5 numbers from
      // AreaKpiCards at the top of the screen, just printed in the PDF.
      autoTable(doc, {
        startY: 31,
        margin: { left: mX, right: mX },
        head: [["VENDA TOTAL", "PLUS (ÁREA)", "PLUS C/ VENDA", "PLUS S/ VENDA", "VENDA MÉDIA/PLU"]],
        body: [
          [
            fmtBRL(total),
            fmtInt(plusTotal),
            fmtInt(plusWithSale),
            fmtInt(noSale),
            fmtBRL(avgPerPlu),
          ],
        ],
        theme: "grid",
        styles: {
          font: "helvetica",
          fontSize: 8,
          cellPadding: 2,
          halign: "center",
          lineColor: [153, 153, 153],
          lineWidth: 0.1,
          textColor: [17, 17, 17],
        },
        headStyles: {
          fillColor: [238, 238, 255],
          textColor: [17, 17, 17],
          fontStyle: "bold",
          fontSize: 7,
        },
      });
      const kpiEndY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable
        .finalY;

      autoTable(doc, {
        startY: kpiEndY + 4,
        margin: { left: mX, right: mX },
        head: [["PLU", "PRODUTO", "VENDA", "DIAS S/ VENDA", "QTD", "VALIDADE"]],
        body: filtered.length
          ? filtered.map((p) => [
              p.prod_code,
              p.prod_name,
              fmtBRL(p.val),
              daysSinceLabel(p.lastSaleDate),
              "",
              "",
            ])
          : [["", "Nenhum produto.", "", "", "", ""]],
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
        },
        columnStyles: {
          0: { cellWidth: 16 },
          1: { cellWidth: 82, overflow: "hidden" },
          2: { cellWidth: 23, halign: "right" },
          3: { cellWidth: 24, halign: "right" },
          4: { cellWidth: 20 },
          5: { cellWidth: 25 },
        },
        didParseCell: (h) => {
          if (h.section === "body" && (h.column.index === 4 || h.column.index === 5))
            h.cell.text = [];
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

      // Timestamp at the end: without it, exporting the same period twice
      // generates the same filename, and the browser/viewer reuses the old
      // version instead of showing the freshly generated PDF.
      const timestamp = format(new Date(), "yyyyMMdd-HHmmss");
      const filename = `analise-area-${slugifyFilename(area)}-${dateFrom}-a-${dateTo}-${timestamp}.pdf`;
      await openPdfBlob(doc, filename);
    } finally {
      setPdfLoading(false);
    }
  };

  return { pdfLoading, pdfElapsed, openPdfInNewTab };
}
