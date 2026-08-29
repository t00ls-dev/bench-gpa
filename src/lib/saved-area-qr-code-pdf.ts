import type jsPDF from "jspdf";
import { openPdfBlob, slugifyFilename } from "@/lib/export-pdf";

const LABEL_SIZE_MM = 65;
const QR_SIZE_MM = 45;
const CUT_MARK_LENGTH_MM = 3;
const TEXT_MAX_WIDTH_MM = 57;

type QrMatrix = {
  size: number;
  get: (x: number, y: number) => 0 | 1;
};

export type SavedAreaQrCodeLabel = {
  id: string;
  name: string;
  storeCode: string;
  storeName: string | null;
};

function fitText(doc: jsPDF, text: string, maxWidth: number): string {
  let fontSize = 8;
  doc.setFontSize(fontSize);

  while (fontSize > 5.5 && doc.getTextWidth(text) > maxWidth) {
    fontSize -= 0.5;
    doc.setFontSize(fontSize);
  }

  if (doc.getTextWidth(text) <= maxWidth) return text;

  let fitted = text;
  while (fitted.length > 1 && doc.getTextWidth(`${fitted}...`) > maxWidth) {
    fitted = fitted.slice(0, -1);
  }
  return `${fitted.trimEnd()}...`;
}

function drawCutMarks(doc: jsPDF, x: number, y: number): void {
  const endX = x + LABEL_SIZE_MM;
  const endY = y + LABEL_SIZE_MM;

  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.15);
  doc.line(x - CUT_MARK_LENGTH_MM, y, x, y);
  doc.line(x, y - CUT_MARK_LENGTH_MM, x, y);
  doc.line(endX, y, endX + CUT_MARK_LENGTH_MM, y);
  doc.line(endX, y - CUT_MARK_LENGTH_MM, endX, y);
  doc.line(x - CUT_MARK_LENGTH_MM, endY, x, endY);
  doc.line(x, endY, x, endY + CUT_MARK_LENGTH_MM);
  doc.line(endX, endY, endX + CUT_MARK_LENGTH_MM, endY);
  doc.line(endX, endY, endX, endY + CUT_MARK_LENGTH_MM);
}

export function renderSavedAreaQrCodeLabel(
  doc: jsPDF,
  matrix: QrMatrix,
  analysis: SavedAreaQrCodeLabel,
): void {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const labelX = (pageWidth - LABEL_SIZE_MM) / 2;
  const labelY = (pageHeight - LABEL_SIZE_MM) / 2;
  const centerX = pageWidth / 2;
  const qrX = centerX - QR_SIZE_MM / 2;
  const qrY = labelY + 10;

  drawCutMarks(doc, labelX, labelY);

  doc.setFont("helvetica", "bold");
  doc.setTextColor(0, 0, 0);
  const name = fitText(doc, analysis.name, TEXT_MAX_WIDTH_MM);
  doc.text(name, centerX, labelY + 6, { align: "center" });

  doc.setFillColor(255, 255, 255);
  doc.rect(qrX, qrY, QR_SIZE_MM, QR_SIZE_MM, "F");
  doc.setFillColor(0, 0, 0);
  const quietZoneModules = 4;
  const totalModules = matrix.size + quietZoneModules * 2;
  const moduleSize = QR_SIZE_MM / totalModules;

  for (let row = 0; row < matrix.size; row += 1) {
    for (let column = 0; column < matrix.size; column += 1) {
      if (matrix.get(column, row)) {
        doc.rect(
          qrX + (column + quietZoneModules) * moduleSize,
          qrY + (row + quietZoneModules) * moduleSize,
          moduleSize,
          moduleSize,
          "F",
        );
      }
    }
  }

  doc.setFont("helvetica", "normal");
  const store = fitText(
    doc,
    analysis.storeName ? `${analysis.storeCode} - ${analysis.storeName}` : analysis.storeCode,
    TEXT_MAX_WIDTH_MM,
  );
  doc.text(store, centerX, labelY + 62, { align: "center" });
}

export async function downloadSavedAreaQrCodePdf(
  url: string,
  analysis: SavedAreaQrCodeLabel,
): Promise<void> {
  const [{ default: jsPDF }, { Byte, Encoder }] = await Promise.all([
    import("jspdf"),
    import("@nuintun/qrcode"),
  ]);
  const matrix = new Encoder({ level: "M" }).encode(new Byte(url));
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  renderSavedAreaQrCodeLabel(doc, matrix, analysis);
  const filename = `${slugifyFilename(analysis.name) || analysis.id}-qr-code.pdf`;
  await openPdfBlob(doc, filename);
}
