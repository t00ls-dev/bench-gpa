// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { fmtBRL } from "@/lib/utils";
import { slugifyFilename } from "@/lib/export-pdf";
import { useProductionPdfExport } from "./use-production-pdf-export";
import type { ProductionForecastProduct, ProductionSecaoForecast } from "@/lib/api-types";

const { openPdfBlob } = vi.hoisted(() => ({ openPdfBlob: vi.fn() }));
vi.mock("@/lib/export-pdf", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/export-pdf")>();
  return { ...actual, openPdfBlob };
});

type AutoTableCall = { head: unknown; body: unknown[][] };
let autoTableCalls: AutoTableCall[] = [];

vi.mock("jspdf-autotable", () => ({
  default: vi.fn((doc: { lastAutoTable: { finalY: number } }, opts: AutoTableCall) => {
    autoTableCalls.push(opts);
    doc.lastAutoTable = { finalY: 40 };
  }),
}));

const { MockJsPDF, textCalls } = vi.hoisted(() => {
  const textCalls: unknown[][] = [];
  return {
    textCalls,
    MockJsPDF: class {
      setFont = vi.fn();
      setFontSize = vi.fn();
      setTextColor = vi.fn();
      text = vi.fn((...args: unknown[]) => textCalls.push(args));
      lastAutoTable = { finalY: 40 };
    },
  };
});
vi.mock("jspdf", () => ({ default: MockJsPDF }));

function produto(overrides: Partial<ProductionForecastProduct> = {}): ProductionForecastProduct {
  return {
    prodCode: "1",
    prodName: "PICANHA",
    secao: "CARNES E AVES",
    grupo: "BOVINOS",
    subgrupo: "CORTES NOBRES",
    occurrences: 6,
    forecastVal: 500,
    forecastMin: 380,
    forecastMax: 610,
    ...overrides,
  };
}

function secao(overrides: Partial<ProductionSecaoForecast> = {}): ProductionSecaoForecast {
  return {
    secao: "CARNES E AVES",
    produtos: [produto()],
    totalSecao: 500,
    ...overrides,
  };
}

function makeParams(overrides: Record<string, unknown> = {}) {
  return {
    secoes: [secao()],
    productFilter: [] as string[],
    subgrupoFilter: [] as string[],
    storeLabel: "1516 - LEBLON",
    targetDate: "2026-07-13",
    lookbackOccurrences: 8,
    ...overrides,
  };
}

describe("useProductionPdfExport", () => {
  beforeEach(() => {
    autoTableCalls = [];
    textCalls.length = 0;
    openPdfBlob.mockClear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("toggles pdfLoading around the export and opens the generated blob", async () => {
    const { result } = renderHook(() => useProductionPdfExport(makeParams()));
    expect(result.current.pdfLoading).toBe(false);

    let pending: Promise<void>;
    act(() => {
      pending = result.current.openPdfInNewTab();
    });
    expect(result.current.pdfLoading).toBe(true);

    await act(async () => {
      await pending;
    });
    expect(result.current.pdfLoading).toBe(false);
    expect(openPdfBlob).toHaveBeenCalledTimes(1);
  });

  it("builds a filename from the store label, date and a timestamp via slugifyFilename", async () => {
    const { result } = renderHook(() => useProductionPdfExport(makeParams()));
    await act(async () => {
      await result.current.openPdfInNewTab();
    });
    const expectedPrefix = `previsao-venda-${slugifyFilename("1516 - LEBLON")}-2026-07-13-`;
    expect(openPdfBlob).toHaveBeenCalledWith(
      expect.anything(),
      expect.stringMatching(new RegExp(`^${expectedPrefix}\\d{8}-\\d{6}\\.pdf$`)),
    );
  });

  it("prints PLU/PRODUTO/MÍN/MÉDIA/MÁX/QTD PRODUZIDA and leaves the last column blank", async () => {
    const { result } = renderHook(() => useProductionPdfExport(makeParams()));
    await act(async () => {
      await result.current.openPdfInNewTab();
    });
    expect(autoTableCalls[0].head).toEqual([
      ["PLU", "PRODUTO", "MÍN", "MÉDIA", "MÁX", "QTD PRODUZIDA"],
    ]);
    const productRow = autoTableCalls[0].body.find((r) => r[0] === "1");
    expect(productRow).toEqual(["1", "PICANHA", fmtBRL(380), fmtBRL(500), fmtBRL(610), ""]);
  });

  it("prints every product individually, including one with a single occurrence (min === val === max)", async () => {
    const secoes = [
      secao({
        produtos: [
          produto({ prodCode: "1" }),
          produto({
            prodCode: "2",
            prodName: "COSTELA",
            occurrences: 1,
            forecastVal: 90,
            forecastMin: 90,
            forecastMax: 90,
          }),
        ],
        totalSecao: 590,
      }),
    ];
    const { result } = renderHook(() => useProductionPdfExport(makeParams({ secoes })));
    await act(async () => {
      await result.current.openPdfInNewTab();
    });
    const body = autoTableCalls[0].body;
    const row2 = body.find((r) => r[0] === "2");
    expect(row2).toEqual(["2", "COSTELA", fmtBRL(90), fmtBRL(90), fmtBRL(90), ""]);
  });

  it("prints a flat table with PLU/PRODUTO/MÍN/MÉDIA/MÁX/QTD PRODUZIDA", async () => {
    const { result } = renderHook(() => useProductionPdfExport(makeParams()));
    await act(async () => {
      await result.current.openPdfInNewTab();
    });
    const body = autoTableCalls[0].body as unknown as { content: string; colSpan: number }[][];
    expect(body).toHaveLength(1);
    expect(body[0]).toEqual(["1", "PICANHA", fmtBRL(380), fmtBRL(500), fmtBRL(610), ""]);
  });

  it("respects productFilter: narrows to the selected products, same as the screen", async () => {
    const secoes = [
      secao({
        produtos: [produto({ prodCode: "1" }), produto({ prodCode: "2", prodName: "COSTELA" })],
        totalSecao: 1000,
      }),
    ];
    const { result } = renderHook(() =>
      useProductionPdfExport(makeParams({ secoes, productFilter: ["1"] })),
    );
    await act(async () => {
      await result.current.openPdfInNewTab();
    });
    const body = autoTableCalls[0].body;
    expect(body.some((r) => r[0] === "2")).toBe(false);
  });

  it("respects subgrupoFilter: narrows to the selected subgrupo's products", async () => {
    const secoes = [
      secao({
        produtos: [
          produto({ prodCode: "1" }),
          produto({ prodCode: "2", prodName: "COSTELA", subgrupo: "OUTRO" }),
        ],
      }),
    ];
    const { result } = renderHook(() =>
      useProductionPdfExport(makeParams({ secoes, subgrupoFilter: ["CORTES NOBRES"] })),
    );
    await act(async () => {
      await result.current.openPdfInNewTab();
    });
    const body = autoTableCalls[0].body;
    expect(body.some((r) => r[0] === "1")).toBe(true);
    expect(body.some((r) => r[0] === "2")).toBe(false);
  });
});
