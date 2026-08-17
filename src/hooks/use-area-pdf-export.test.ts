// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { fmtBRL, fmtInt } from "@/lib/utils";
import { slugifyFilename } from "@/lib/export-pdf";
import { EXPORT_PAGE_SIZE } from "@/lib/schemas";
import { useAreaPdfExport } from "./use-area-pdf-export";
import type { AreaFilters, AreaProduct, AreaSortKey } from "./use-area-products-view";

vi.mock("@tanstack/react-start", () => ({
  useServerFn: (fn: unknown) => fn,
}));

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

const { MockJsPDF } = vi.hoisted(() => ({
  MockJsPDF: class {
    setFont = vi.fn();
    setFontSize = vi.fn();
    setTextColor = vi.fn();
    text = vi.fn();
    lastAutoTable = { finalY: 40 };
  },
}));
vi.mock("jspdf", () => ({ default: MockJsPDF }));

function filters(overrides: Partial<AreaFilters> = {}): AreaFilters {
  return {
    dateFrom: "2026-07-14",
    dateTo: "2026-07-20",
    stores: ["1"],
    deptos: ["MERC"],
    secoes: [],
    grupos: [],
    subgrupos: [],
    ...overrides,
  };
}

function product(overrides: Partial<AreaProduct>): AreaProduct {
  return {
    prod_code: "P1",
    prod_name: "Produto",
    depto: "MERC",
    secao: null,
    grupo: null,
    subgrupo: null,
    val: 0,
    lastSaleDate: null,
    ...overrides,
  };
}

// daysSinceNum interprets lastSaleDate itself as a number of days, just to
// keep the comparator test readable without recomputing dates.
const daysSinceNum = (iso: string | null): number | null => (iso === null ? null : Number(iso));
const daysSinceLabel = (iso: string | null): string => (iso === null ? "-" : String(Number(iso)));

function makeParams(overrides: Record<string, unknown> = {}) {
  return {
    getArea: vi.fn().mockResolvedValue({ products: [] }),
    af: filters(),
    search: "",
    sortKey: "val" as AreaSortKey,
    sortDir: "desc" as "asc" | "desc",
    daysSinceNum,
    daysSinceLabel,
    total: 1000,
    noSale: 2,
    pathParts: ["Loja 1 - LEBLON", "MERC"],
    plusTotal: 10,
    plusWithSale: 8,
    avgPerPlu: 125,
    ...overrides,
  };
}

describe("useAreaPdfExport", () => {
  beforeEach(() => {
    autoTableCalls = [];
    openPdfBlob.mockClear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("requests the full listing (not the paginated page) with the current filters", async () => {
    const getArea = vi.fn().mockResolvedValue({ products: [] });
    const { result } = renderHook(() =>
      useAreaPdfExport(
        makeParams({
          getArea,
          af: filters({ secoes: ["SEC1"] }),
          search: "  abc  ",
          sortKey: "prod_name",
          sortDir: "asc",
        }),
      ),
    );

    await act(async () => {
      await result.current.openPdfInNewTab();
    });

    expect(getArea).toHaveBeenCalledWith({
      data: {
        dateFrom: "2026-07-14",
        dateTo: "2026-07-20",
        stores: ["1"],
        deptos: ["MERC"],
        secoes: ["SEC1"],
        grupos: [],
        subgrupos: [],
        search: "abc",
        sortBy: "prod_name",
        sortDir: "asc",
        page: 1,
        pageSize: EXPORT_PAGE_SIZE,
      },
    });
  });

  it("toggles pdfLoading around the export and opens the generated blob", async () => {
    const { result } = renderHook(() => useAreaPdfExport(makeParams()));
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

  it("resets pdfLoading and rethrows when the server call fails", async () => {
    const getArea = vi.fn().mockRejectedValue(new Error("boom"));
    const { result } = renderHook(() => useAreaPdfExport(makeParams({ getArea })));

    await act(async () => {
      await expect(result.current.openPdfInNewTab()).rejects.toThrow("boom");
    });
    expect(result.current.pdfLoading).toBe(false);
    expect(openPdfBlob).not.toHaveBeenCalled();
  });

  it("builds a filename from the breadcrumb, date range and a timestamp via slugifyFilename", async () => {
    const { result } = renderHook(() => useAreaPdfExport(makeParams()));
    await act(async () => {
      await result.current.openPdfInNewTab();
    });
    const expectedPrefix = `analise-area-${slugifyFilename("Loja 1 - LEBLON › MERC")}-2026-07-14-a-2026-07-20-`;
    // Timestamp at the end guarantees a unique name for every export
    // (avoids reusing an old cached PDF when the same period is exported again).
    expect(openPdfBlob).toHaveBeenCalledWith(
      expect.anything(),
      expect.stringMatching(new RegExp(`^${expectedPrefix}\\d{8}-\\d{6}\\.pdf$`)),
    );
  });

  it("prints the same 5 KPI numbers shown on screen", async () => {
    const { result } = renderHook(() => useAreaPdfExport(makeParams()));
    await act(async () => {
      await result.current.openPdfInNewTab();
    });
    expect(autoTableCalls[0].body).toEqual([
      [fmtBRL(1000), fmtInt(10), fmtInt(8), fmtInt(2), fmtBRL(125)],
    ]);
  });

  it("filters products by search term across prod_code and prod_name", async () => {
    const products = [
      product({ prod_code: "P1", prod_name: "Produto Alpha" }),
      product({ prod_code: "P2", prod_name: "Produto Bravo" }),
    ];
    const getArea = vi.fn().mockResolvedValue({ products });
    const { result } = renderHook(() => useAreaPdfExport(makeParams({ getArea, search: "alpha" })));
    await act(async () => {
      await result.current.openPdfInNewTab();
    });
    const body = autoTableCalls[1].body;
    expect(body).toHaveLength(1);
    expect(body[0][0]).toBe("P1");
  });

  it("shows a placeholder row when no product matches", async () => {
    const getArea = vi.fn().mockResolvedValue({ products: [] });
    const { result } = renderHook(() => useAreaPdfExport(makeParams({ getArea, search: "zzz" })));
    await act(async () => {
      await result.current.openPdfInNewTab();
    });
    expect(autoTableCalls[1].body).toEqual([["", "Nenhum produto.", "", ""]]);
  });

  it("sorts by val ascending/descending", async () => {
    const products = [
      product({ prod_code: "P3", val: 30 }),
      product({ prod_code: "P1", val: 10 }),
      product({ prod_code: "P2", val: 20 }),
    ];
    const getArea = vi.fn().mockResolvedValue({ products });

    const desc = renderHook(() =>
      useAreaPdfExport(makeParams({ getArea, sortKey: "val", sortDir: "desc" })),
    );
    await act(async () => {
      await desc.result.current.openPdfInNewTab();
    });
    expect(autoTableCalls[1].body.map((r) => r[0])).toEqual(["P3", "P2", "P1"]);

    autoTableCalls = [];
    const asc = renderHook(() =>
      useAreaPdfExport(makeParams({ getArea, sortKey: "val", sortDir: "asc" })),
    );
    await act(async () => {
      await asc.result.current.openPdfInNewTab();
    });
    expect(autoTableCalls[1].body.map((r) => r[0])).toEqual(["P1", "P2", "P3"]);
  });

  it("sorts by daysSince, placing never-sold items first when descending", async () => {
    const products = [
      product({ prod_code: "P3", lastSaleDate: "5" }),
      product({ prod_code: "P1", lastSaleDate: null }),
      product({ prod_code: "P2", lastSaleDate: "1" }),
    ];
    const getArea = vi.fn().mockResolvedValue({ products });

    const desc = renderHook(() =>
      useAreaPdfExport(makeParams({ getArea, sortKey: "daysSince", sortDir: "desc" })),
    );
    await act(async () => {
      await desc.result.current.openPdfInNewTab();
    });
    expect(autoTableCalls[1].body.map((r) => r[0])).toEqual(["P1", "P3", "P2"]);

    autoTableCalls = [];
    const asc = renderHook(() =>
      useAreaPdfExport(makeParams({ getArea, sortKey: "daysSince", sortDir: "asc" })),
    );
    await act(async () => {
      await asc.result.current.openPdfInNewTab();
    });
    expect(autoTableCalls[1].body.map((r) => r[0])).toEqual(["P2", "P3", "P1"]);
  });
});
