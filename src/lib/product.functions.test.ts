import { describe, it, expect, vi, beforeEach } from "vitest";

type Middleware = (opts: {
  next: (ctx: unknown) => unknown;
  context: unknown;
  data: unknown;
}) => unknown;
type Handler = (opts: { data?: unknown; context: unknown }) => unknown;

vi.mock("@tanstack/react-start", () => {
  const buildChain = () => {
    const chain: {
      middlewares: Middleware[];
      middleware?: unknown;
      inputValidator?: unknown;
      handler?: unknown;
    } = { middlewares: [] };
    chain.middleware = (mw: Middleware[]) => {
      chain.middlewares = mw;
      return {
        inputValidator: () => ({
          handler: (fn: Handler) => async (input: unknown) => fn({ data: input, context: {} }),
        }),
        handler: (fn: Handler) => async (input: unknown) => fn({ data: input, context: {} }),
      };
    };
    chain.inputValidator = () => chain;
    chain.handler = (fn: Handler) => (input?: unknown) => fn({ data: input, context: {} });
    return chain;
  };
  return { createServerFn: buildChain };
});

vi.mock("./auth-middleware", () => ({
  requireAuth: vi.fn(({ next }: { next: (ctx: unknown) => unknown }) => next({})),
}));
vi.mock("./rate-limit.middleware", () => ({
  requireRateLimit: vi.fn(
    () =>
      ({ next }: { next: (ctx: unknown) => unknown }) =>
        next({}),
  ),
}));
vi.mock("./db", () => ({ default: { query: vi.fn() } }));

import { searchProducts, getProductByCode, getProductAnalysis } from "./product.functions";
import db from "./db";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("searchProducts", () => {
  it("searches with LIKE on both sides (code and name), wrapped in %", async () => {
    vi.mocked(db.query).mockResolvedValueOnce([
      [{ prod_code: "1008160", prod_name: "ARROZ TIO JOAO" }],
    ] as never);

    const result = await (searchProducts as (d: { q: string }) => Promise<unknown>)({
      q: "arroz",
    });

    expect(result).toEqual([{ prod_code: "1008160", prod_name: "ARROZ TIO JOAO" }]);
    expect(db.query).toHaveBeenCalledWith(expect.stringContaining("LIKE ? OR prod_code LIKE ?"), [
      "%arroz%",
      "%arroz%",
    ]);
  });

  it("returns an empty array when the database returns no rows", async () => {
    vi.mocked(db.query).mockResolvedValueOnce([undefined] as never);
    const result = await (searchProducts as (d: { q: string }) => Promise<unknown>)({
      q: "xyz",
    });
    expect(result).toEqual([]);
  });
});

describe("getProductByCode", () => {
  it("exact match by prod_code, trimmed", async () => {
    vi.mocked(db.query).mockResolvedValueOnce([
      [{ prod_code: "1008160", prod_name: "ARROZ TIO JOAO" }],
    ] as never);

    const result = await (getProductByCode as (d: { prodCode: string }) => Promise<unknown>)({
      prodCode: "  1008160  ",
    });

    expect(result).toEqual({ prod_code: "1008160", prod_name: "ARROZ TIO JOAO" });
    expect(db.query).toHaveBeenCalledWith(expect.stringContaining("prod_code = ?"), ["1008160"]);
  });

  it("returns null when the product doesn't exist", async () => {
    vi.mocked(db.query).mockResolvedValueOnce([[]] as never);
    const result = await (getProductByCode as (d: { prodCode: string }) => Promise<unknown>)({
      prodCode: "9999999",
    });
    expect(result).toBeNull();
  });
});

describe("getProductAnalysis", () => {
  const PROC_RESULT = [
    [
      [
        {
          prod_code: "1008160",
          prod_name: "ARROZ TIO JOAO",
          depto: "MERCEARIA",
          secao: "SECA",
          grupo: "ARROZ",
          subgrupo: "ARROZ BRANCO",
        },
      ],
      [{ ref_date: "2026-07-20", ref_value: 199.32 }],
      [{ code: "1516", name: "Loja Centro", val: 150.5 }],
      [{ date: "2026-07-20", val: 199.32 }],
      [{ date: "2026-07-13", val: 84 }],
      [{ date: "2026-07-13", val: 84 }],
    ],
  ];

  it("calls product_analysis with serialized storeCodes and maps the 6 result sets", async () => {
    vi.mocked(db.query).mockResolvedValueOnce(PROC_RESULT as never);

    const result = await (
      getProductAnalysis as (d: {
        prodCode: string;
        storeCodes: string[];
        referenceDate: string | null;
      }) => Promise<unknown>
    )({ prodCode: "1008160", storeCodes: ["1516"], referenceDate: "2026-07-20" });

    expect(db.query).toHaveBeenCalledWith("CALL product_analysis(?, ?, ?)", [
      "1008160",
      JSON.stringify(["1516"]),
      "2026-07-20",
    ]);
    expect(result).toEqual({
      product: {
        prod_code: "1008160",
        prod_name: "ARROZ TIO JOAO",
        depto: "MERCEARIA",
        secao: "SECA",
        grupo: "ARROZ",
        subgrupo: "ARROZ BRANCO",
      },
      refDate: "2026-07-20",
      refValue: 199.32,
      byStore: [{ code: "1516", name: "Loja Centro", val: 150.5 }],
      evolution: [{ date: "2026-07-20", val: 199.32 }],
      lastFourSameWeekday: [{ date: "2026-07-13", val: 84 }],
      lastFourAll: [{ date: "2026-07-13", val: 84 }],
    });
  });

  it("with no storeCodes, sends an empty-array JSON (all stores) and referenceDate null", async () => {
    vi.mocked(db.query).mockResolvedValueOnce(PROC_RESULT as never);

    await (
      getProductAnalysis as (d: {
        prodCode: string;
        storeCodes: string[];
        referenceDate: string | null;
      }) => Promise<unknown>
    )({ prodCode: "1008160", storeCodes: [], referenceDate: null });

    expect(db.query).toHaveBeenCalledWith("CALL product_analysis(?, ?, ?)", [
      "1008160",
      "[]",
      null,
    ]);
  });

  it("product comes back null when the PLU doesn't exist in products", async () => {
    const emptyProductResult = [[[], [{ ref_date: null, ref_value: 0 }], [], [], [], []]];
    vi.mocked(db.query).mockResolvedValueOnce(emptyProductResult as never);

    const result = await (
      getProductAnalysis as (d: {
        prodCode: string;
        storeCodes: string[];
        referenceDate: string | null;
      }) => Promise<{ product: unknown }>
    )({ prodCode: "0000000", storeCodes: [], referenceDate: null });

    expect(result.product).toBeNull();
  });
});
