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
  it("centers a 65 mm label on A4 with crop marks, title, store, and vector modules", () => {
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

    expect(document.line).toHaveBeenCalledTimes(8);
    expect(document.text).toHaveBeenNthCalledWith(1, "Ponta de gôndola", 105, 122, {
      align: "center",
    });
    expect(document.text).toHaveBeenNthCalledWith(2, "1516 - Loja Teste", 105, 178, {
      align: "center",
    });
    expect(document.rect).toHaveBeenCalledWith(82.5, 126, 45, 45, "F");
    expect(document.rect).toHaveBeenCalledTimes(3);
  });
});
