// @vitest-environment jsdom
import type jsPDF from "jspdf";
import { describe, expect, it, vi } from "vitest";
import { renderSavedAreaQrCodeLabel } from "./saved-area-qr-code-pdf";

function createDocument() {
  const document = {
    internal: {
      pageSize: {
        getWidth: () => 210,
        getHeight: () => 297,
      },
    },
    setDrawColor: vi.fn(),
    setLineWidth: vi.fn(),
    setLineDashPattern: vi.fn(),
    line: vi.fn(),
    setFont: vi.fn(),
    setTextColor: vi.fn(),
    setFontSize: vi.fn(),
    getTextWidth: vi.fn((text: string) => text.length * 1.5),
    text: vi.fn(),
    setFillColor: vi.fn(),
    rect: vi.fn(),
  };
  return document;
}

describe("saved area QR Code print label", () => {
  it("centers a 65 mm label on A4 with a dotted cut outline and uppercase text", () => {
    const document = createDocument();
    const matrix = {
      size: 2,
      get: (x: number, y: number) => (x === y ? 1 : 0) as 0 | 1,
    };

    renderSavedAreaQrCodeLabel(document as unknown as jsPDF, matrix, {
      id: "analysis-id",
      name: "Ponta de gôndola",
      storeCode: "1516",
      storeName: "Loja Teste",
    });

    expect(document.setLineDashPattern).toHaveBeenNthCalledWith(1, [0.5, 0.8], 0);
    expect(document.line).toHaveBeenCalledTimes(4);
    expect(document.line).toHaveBeenNthCalledWith(1, 72.5, 116, 137.5, 116);
    expect(document.line).toHaveBeenNthCalledWith(3, 137.5, 181, 72.5, 181);
    expect(document.setLineDashPattern).toHaveBeenNthCalledWith(2, [], 0);
    expect(document.text).toHaveBeenNthCalledWith(1, "PONTA DE GÔNDOLA", 105, 122, {
      align: "center",
    });
    expect(document.text).toHaveBeenNthCalledWith(2, "1516 - LOJA TESTE", 105, 178, {
      align: "center",
    });
    expect(document.rect).toHaveBeenCalledWith(82.5, 126, 45, 45, "F");
    expect(document.rect).toHaveBeenCalledTimes(3);
  });
});
