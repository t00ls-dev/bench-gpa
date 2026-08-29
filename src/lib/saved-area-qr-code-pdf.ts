import type jsPDF from "jspdf";
import { openPdfBlob, slugifyFilename } from "@/lib/export-pdf";

const LABEL_SIZE_MM = 65;
const QR_SIZE_MM = 45;
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

function drawCutOutline(doc: jsPDF, x: number, y: number): void {
  const endX = x + LABEL_SIZE_MM;
  const endY = y + LABEL_SIZE_MM;

  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.15);
  doc.setLineDashPattern([0.5, 0.8], 0);
  doc.line(x, y, endX, y);
  doc.line(endX, y, endX, endY);
  doc.line(endX, endY, x, endY);
  doc.line(x, endY, x, y);
  doc.setLineDashPattern([], 0);
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

  drawCutOutline(doc, labelX, labelY);

  doc.setFont("helvetica", "bold");
  doc.setTextColor(0, 0, 0);
  const name = fitText(doc, analysis.name.toLocaleUpperCase("pt-BR"), TEXT_MAX_WIDTH_MM);
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
  const storeLabel = analysis.storeName
    ? `${analysis.storeCode} - ${analysis.storeName}`
    : analysis.storeCode;
  const store = fitText(doc, storeLabel.toLocaleUpperCase("pt-BR"), TEXT_MAX_WIDTH_MM);
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
