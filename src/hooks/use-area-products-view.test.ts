// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement, StrictMode, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import {
  useAreaProductsView,
  type AreaProduct,
  type AreaSearchParams,
} from "./use-area-products-view";

vi.mock("@tanstack/react-start", () => ({
  useServerFn: (fn: unknown) => fn,
}));

vi.mock("@/lib/area.functions", () => ({
  getAreaAnalysis: vi.fn(),
  getAreaFilterHierarchy: vi.fn(),
  getAreaProductFilterOptions: vi.fn(),
}));

import { getAreaFilterHierarchy, getAreaProductFilterOptions } from "@/lib/area.functions";

const mockHierarchy = vi.mocked(getAreaFilterHierarchy);
const mockProductOptions = vi.mocked(getAreaProductFilterOptions);

const STORAGE_KEY = "bench-gpa:filters:area:v2";

const HIER_FIXTURE = {
  latestDate: "2026-07-20",
  availableDates: [
    "2026-07-14",
    "2026-07-15",
    "2026-07-16",
    "2026-07-17",
    "2026-07-18",
    "2026-07-19",
    "2026-07-20",
  ],
  hierarchy: [
    {
      store_code: "1",
      store_name: "LEBLON",
      depto: "MERC",
      secao: "SEC1",
      grupo: "G1",
      subgrupo: "SG1",
    },
    {
      store_code: "1",
      store_name: "LEBLON",
      depto: "MERC",
      secao: "SEC2",
      grupo: "G2",
      subgrupo: "SG2",
    },
    {
      store_code: "2",
      store_name: "IPANEMA",
      depto: "MERC",
      secao: "SEC1",
      grupo: "G1",
      subgrupo: "SG1",
    },
  ],
};

function product(overrides: Partial<AreaProduct>): AreaProduct {
  return {
    prod_code: "P1",
    prod_name: "Produto",
    depto: "MERC",
    secao: "SEC1",
    grupo: "G1",
    subgrupo: "SG1",
    val: 0,
    lastSaleDate: null,
    ...overrides,
  };
}

function areaResult(products: AreaProduct[] = []) {
  return {
    chartScopeKey: "",
    total: 1000,
    plusTotal: 10,
    plusWithSale: 8,
    plusWithoutSale: 2,
    avgPerPlu: 125,
    products,
    byDate: [],
    totalProducts: products.length,
    page: 1,
    pageSize: 25,
    totalPages: 1,
  };
}

function makeWrapper(strict = false) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: { children: ReactNode }) {
    const content = createElement(QueryClientProvider, { client: qc }, children);
    return strict ? createElement(StrictMode, null, content) : content;
  };
}

function noSearchParams(): AreaSearchParams {
  return {};
}

describe("useAreaProductsView", () => {
  beforeEach(() => {
    localStorage.clear();
    mockHierarchy.mockReset();
    mockHierarchy.mockResolvedValue(HIER_FIXTURE);
    mockProductOptions.mockResolvedValue([
      { prodCode: "P1", prodName: "Produto 1" },
      { prodCode: "P2", prodName: "Produto 2" },
    ]);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("keeps the products query disabled until stores and deptos are both chosen", async () => {
    const getArea = vi.fn().mockResolvedValue(areaResult());
    const { result } = renderHook(() => useAreaProductsView(getArea, noSearchParams()), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.dateFrom).toBe("2026-07-14"));
    expect(result.current.ready).toBe(false);
    expect(getArea).not.toHaveBeenCalled();

    act(() => result.current.setStores(["1"]));
    expect(result.current.ready).toBe(false);
    expect(getArea).not.toHaveBeenCalled();

    act(() => result.current.setDeptos(["MERC"]));
    await waitFor(() => expect(getArea).toHaveBeenCalled());
    expect(result.current.ready).toBe(true);
    expect(getArea).toHaveBeenCalledWith({
      data: expect.objectContaining({
        dateFrom: "2026-07-14",
        dateTo: "2026-07-20",
        stores: ["1"],
        deptos: ["MERC"],
        secoes: [],
        grupos: [],
        subgrupos: [],
        products: [],
        page: 1,
        pageSize: 25,
        search: "",
        sortBy: "val",
        sortDir: "desc",
      }),
    });
  });

  it("loads a saved composition without requiring a department", async () => {
    const getArea = vi.fn().mockResolvedValue(areaResult());
    const { result } = renderHook(
      () =>
        useAreaProductsView(getArea, noSearchParams(), {
          id: "550e8400-e29b-41d4-a716-446655440000",
          storeCode: "1",
          productCodes: ["P1", "P2"],
        }),
      { wrapper: makeWrapper(true) },
    );

    await waitFor(() => expect(getArea).toHaveBeenCalled());
    expect(result.current.ready).toBe(true);
    expect(result.current.fStores).toEqual(["1"]);
    expect(result.current.fDeptos).toEqual([]);
    expect(result.current.fProducts).toEqual(["P1", "P2"]);
    expect(getArea).toHaveBeenCalledWith({
      data: expect.objectContaining({
        stores: ["1"],
        deptos: [],
        products: ["P1", "P2"],
      }),
    });
  });

  it("does not silently remove a saved product absent from the current universe", async () => {
    const getArea = vi.fn().mockResolvedValue(areaResult());
    mockProductOptions.mockResolvedValueOnce([{ prodCode: "P1", prodName: "Produto 1" }]);
    const { result } = renderHook(
      () =>
        useAreaProductsView(getArea, noSearchParams(), {
          id: "550e8400-e29b-41d4-a716-446655440000",
          storeCode: "1",
          productCodes: ["P1", "P999"],
        }),
      { wrapper: makeWrapper(true) },
    );

    await waitFor(() => expect(getArea).toHaveBeenCalled());
    expect(result.current.fProducts).toEqual(["P1", "P999"]);
    expect(getArea).toHaveBeenCalledWith({
      data: expect.objectContaining({ products: ["P1", "P999"] }),
    });
  });

  it("replaces a locally persisted composition with the current saved composition", async () => {
    const analysisId = "550e8400-e29b-41d4-a716-446655440000";
    localStorage.setItem(
      `bench-gpa:filters:area:saved:${analysisId}`,
      JSON.stringify({
        dateFrom: "2026-07-18",
        dateTo: "2026-07-20",
        stores: ["2"],
        deptos: ["MERC"],
        secoes: ["SEC1"],
        grupos: ["G1"],
        subgrupos: ["SG1"],
        products: ["OLD"],
      }),
    );
    const getArea = vi.fn().mockResolvedValue(areaResult());
    const { result } = renderHook(
      () =>
        useAreaProductsView(getArea, noSearchParams(), {
          id: analysisId,
          storeCode: "1",
          productCodes: ["P1", "P2"],
        }),
      { wrapper: makeWrapper(true) },
    );

    await waitFor(() => expect(result.current.fProducts).toEqual(["P1", "P2"]));
    expect(result.current.af).toEqual({
      dateFrom: "2026-07-18",
      dateTo: "2026-07-20",
      stores: ["1"],
      deptos: [],
      secoes: [],
      grupos: [],
      subgrupos: [],
      products: ["P1", "P2"],
    });
  });

  it("cascades: setting a higher filter level clears the levels below it", () => {
    const { result } = renderHook(() => useAreaProductsView(vi.fn(), noSearchParams()), {
      wrapper: makeWrapper(),
    });

    act(() => {
      result.current.setStores(["1"]);
      result.current.setDeptos(["MERC"]);
      result.current.setSecoes(["SEC1"]);
      result.current.setGrupos(["G1"]);
      result.current.setSubgrupos(["SG1"]);
      result.current.setProducts(["P1"]);
    });
    expect(result.current.af).toMatchObject({
      stores: ["1"],
      deptos: ["MERC"],
      secoes: ["SEC1"],
      grupos: ["G1"],
      subgrupos: ["SG1"],
      products: ["P1"],
    });

    act(() => result.current.setDeptos(["OUTRO"]));
    expect(result.current.af).toMatchObject({
      stores: ["1"],
      deptos: ["OUTRO"],
      secoes: [],
      grupos: [],
      subgrupos: [],
      products: [],
    });
  });

  it("applies a click-through search param once and ignores later param changes", async () => {
    const getArea = vi.fn().mockResolvedValue(areaResult());
    const { result, rerender } = renderHook(
      ({ sp }: { sp: AreaSearchParams }) => useAreaProductsView(getArea, sp),
      {
        wrapper: makeWrapper(),
        initialProps: { sp: { store: "2", depto: "MERC", secao: "SEC1" } as AreaSearchParams },
      },
    );

    await waitFor(() => expect(result.current.fStores).toEqual(["2"]));
    expect(result.current.fDeptos).toEqual(["MERC"]);
    expect(result.current.fSecoes).toEqual(["SEC1"]);
    expect(result.current.fGrupos).toEqual([]);

    rerender({ sp: { store: "9" } });
    expect(result.current.fStores).toEqual(["2"]);
  });

  it("clears persisted stores for an all-store ranking click-through", async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        dateFrom: "2026-07-01",
        dateTo: "2026-07-20",
        stores: ["1"],
        deptos: [],
        secoes: [],
        grupos: [],
        subgrupos: [],
        products: [],
      }),
    );

    const { result } = renderHook(() => useAreaProductsView(vi.fn(), { depto: "MERC" }), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.fDeptos).toEqual(["MERC"]));
    expect(result.current.fStores).toEqual([]);
  });

  it("sanitizes a reversed persisted date range on load", () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        dateFrom: "2026-07-20",
        dateTo: "2026-07-01",
        stores: [],
        deptos: [],
        secoes: [],
        grupos: [],
        subgrupos: [],
      }),
    );
    const { result } = renderHook(() => useAreaProductsView(vi.fn(), noSearchParams()), {
      wrapper: makeWrapper(),
    });
    expect(result.current.dateFrom).toBe("2026-07-01");
    expect(result.current.dateTo).toBe("2026-07-20");
  });

  it("discards non-ISO persisted dates but keeps other persisted filters", () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        dateFrom: "invalid",
        dateTo: "07/20/2026",
        stores: ["9"],
        deptos: [],
        secoes: [],
        grupos: [],
        subgrupos: [],
      }),
    );
    const { result } = renderHook(() => useAreaProductsView(vi.fn(), noSearchParams()), {
      wrapper: makeWrapper(),
    });
    expect(result.current.dateFrom).toBe("");
    expect(result.current.dateTo).toBe("");
    expect(result.current.fStores).toEqual(["9"]);
  });

  it("falls back to the latest date when the persisted range has no overlap with available dates", async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        dateFrom: "2020-01-01",
        dateTo: "2020-01-02",
        stores: [],
        deptos: [],
        secoes: [],
        grupos: [],
        subgrupos: [],
      }),
    );
    const { result } = renderHook(() => useAreaProductsView(vi.fn(), noSearchParams()), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(result.current.dateFrom).toBe("2026-07-20"));
    expect(result.current.dateTo).toBe("2026-07-20");
  });

  it("narrows a partially-overlapping persisted range to the available window", async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        dateFrom: "2026-07-10",
        dateTo: "2026-07-16",
        stores: [],
        deptos: [],
        secoes: [],
        grupos: [],
        subgrupos: [],
      }),
    );
    const { result } = renderHook(() => useAreaProductsView(vi.fn(), noSearchParams()), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(result.current.dateFrom).toBe("2026-07-14"));
    expect(result.current.dateTo).toBe("2026-07-16");
  });

  it("toggleSort flips direction on repeat clicks and picks a sensible default on key change", () => {
    const { result } = renderHook(() => useAreaProductsView(vi.fn(), noSearchParams()), {
      wrapper: makeWrapper(),
    });
    expect(result.current.sortKey).toBe("val");
    expect(result.current.sortAsc).toBe(false);

    act(() => result.current.toggleSort("val"));
    expect(result.current.sortAsc).toBe(true);

    act(() => result.current.toggleSort("prod_code"));
    expect(result.current.sortKey).toBe("prod_code");
    expect(result.current.sortAsc).toBe(true);

    act(() => result.current.toggleSort("daysSince"));
    expect(result.current.sortKey).toBe("daysSince");
    expect(result.current.sortAsc).toBe(false);
  });

  it("re-sorts products client-side by daysSince, placing never-sold items consistently", async () => {
    const products = [
      product({ prod_code: "P3", lastSaleDate: "2026-07-15" }), // 5 days since base 07-20
      product({ prod_code: "P1", lastSaleDate: null }), // never sold
      product({ prod_code: "P2", lastSaleDate: "2026-07-19" }), // 1 day since
    ];
    const getArea = vi.fn().mockResolvedValue(areaResult(products));
    const { result } = renderHook(() => useAreaProductsView(getArea, noSearchParams()), {
      wrapper: makeWrapper(),
    });

    act(() => {
      result.current.setStores(["1"]);
      result.current.setDeptos(["MERC"]);
    });
    await waitFor(() => expect(result.current.products.length).toBe(3));

    // sortAsc=false by default when switching columns: never-sold first,
    // then from the most idle to the most recent.
    act(() => result.current.toggleSort("daysSince"));
    await waitFor(() =>
      expect(result.current.products.map((p) => p.prod_code)).toEqual(["P1", "P3", "P2"]),
    );

    // Clicking the same column again inverts it: most recent first, never-sold at the end.
    act(() => result.current.toggleSort("daysSince"));
    await waitFor(() =>
      expect(result.current.products.map((p) => p.prod_code)).toEqual(["P2", "P3", "P1"]),
    );
  });

  it("dedupes stores from the hierarchy and builds the breadcrumb", async () => {
    const { result } = renderHook(() => useAreaProductsView(vi.fn(), noSearchParams()), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(result.current.stores.length).toBe(2));
    expect(result.current.stores.map((s) => s.store_code)).toEqual(["1", "2"]);

    expect(result.current.pathParts).toEqual(["Todas as lojas"]);

    act(() => result.current.setStores(["1"]));
    expect(result.current.pathParts).toEqual(["Loja 1 - LEBLON"]);

    act(() => result.current.setStores(["1", "2"]));
    expect(result.current.pathParts).toEqual(["2 lojas"]);

    act(() => {
      result.current.setStores(["1"]);
      result.current.setDeptos(["MERC"]);
    });
    expect(result.current.pathParts).toEqual(["Loja 1 - LEBLON", "MERC"]);
  });

  it("maps the KPI fields returned by the server", async () => {
    const products = [product({ prod_code: "P1" })];
    const getArea = vi.fn().mockResolvedValue(areaResult(products));
    const { result } = renderHook(() => useAreaProductsView(getArea, noSearchParams()), {
      wrapper: makeWrapper(),
    });
    act(() => {
      result.current.setStores(["1"]);
      result.current.setDeptos(["MERC"]);
    });
    await waitFor(() => expect(result.current.data).toBeTruthy());
    expect(result.current.total).toBe(1000);
    expect(result.current.noSale).toBe(2);
    expect(result.current.totalRows).toBe(1);
    expect(result.current.totalPages).toBe(1);
  });

  it("clears the previous result while a search request is pending", async () => {
    let resolveSearch: ((value: ReturnType<typeof areaResult>) => void) | undefined;
    const pendingSearch = new Promise<ReturnType<typeof areaResult>>((resolve) => {
      resolveSearch = resolve;
    });
    const getArea = vi
      .fn()
      .mockResolvedValueOnce(areaResult([product({ prod_code: "P1" })]))
      .mockReturnValueOnce(pendingSearch);
    const { result } = renderHook(() => useAreaProductsView(getArea, noSearchParams()), {
      wrapper: makeWrapper(),
    });

    act(() => {
      result.current.setStores(["1"]);
      result.current.setDeptos(["MERC"]);
    });
    await waitFor(() => expect(result.current.products).toHaveLength(1));

    act(() => result.current.setSearch("a"));
    await waitFor(() => expect(result.current.isFetching).toBe(true));
    expect(result.current.search).toBe("a");
    expect(result.current.isLoading).toBe(true);
    expect(result.current.data).toBeUndefined();
    expect(result.current.products).toHaveLength(0);

    resolveSearch?.(areaResult([]));
    await waitFor(() => expect(result.current.isFetching).toBe(false));
  });

  it("keeps the previous result while pagination and sorting requests are pending", async () => {
    let resolvePage: ((value: ReturnType<typeof areaResult>) => void) | undefined;
    let resolveSort: ((value: ReturnType<typeof areaResult>) => void) | undefined;
    const pendingPage = new Promise<ReturnType<typeof areaResult>>((resolve) => {
      resolvePage = resolve;
    });
    const pendingSort = new Promise<ReturnType<typeof areaResult>>((resolve) => {
      resolveSort = resolve;
    });
    const firstResult = { ...areaResult([product({ prod_code: "P1" })]), totalPages: 2 };
    const secondResult = {
      ...areaResult([product({ prod_code: "P2" })]),
      page: 2,
      totalPages: 2,
    };
    const getArea = vi
      .fn()
      .mockResolvedValueOnce(firstResult)
      .mockReturnValueOnce(pendingPage)
      .mockReturnValueOnce(pendingSort);
    const { result } = renderHook(() => useAreaProductsView(getArea, noSearchParams()), {
      wrapper: makeWrapper(),
    });

    act(() => {
      result.current.setStores(["1"]);
      result.current.setDeptos(["MERC"]);
    });
    await waitFor(() => expect(result.current.products[0]?.prod_code).toBe("P1"));

    act(() => result.current.setPage(2));
    await waitFor(() => expect(result.current.isFetching).toBe(true));
    expect(result.current.isLoading).toBe(false);
    expect(result.current.products[0]?.prod_code).toBe("P1");

    resolvePage?.(secondResult);
    await waitFor(() => expect(result.current.products[0]?.prod_code).toBe("P2"));

    act(() => result.current.toggleSort("prod_name"));
    await waitFor(() => expect(result.current.isFetching).toBe(true));
    expect(result.current.isLoading).toBe(false);
    expect(result.current.products[0]?.prod_code).toBe("P2");

    resolveSort?.(secondResult);
    await waitFor(() => expect(result.current.isFetching).toBe(false));
  });
});
