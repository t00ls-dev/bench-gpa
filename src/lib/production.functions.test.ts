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
vi.mock("./admin-utils", () => ({ assertAdmin: vi.fn() }));
vi.mock("./db", () => ({ default: { query: vi.fn() } }));

import { getProductionForecast, getProductionFilterOptions } from "./production.functions";
import { assertAdmin } from "./admin-utils";
import db from "./db";
import { cache } from "./cache";

// The proc returns 3 result sets: individual products (every product that
// sold at least once, no confidence floor -- carrying grupo/subgrupo),
// every section of PERECIVEIS from product_universe, and metadata.
const PROC_RESULT_MIXED = [
  [
    [
      {
        prod_code: "1",
        prod_name: "PICANHA",
        secao: "CARNES E AVES",
        grupo: "BOVINOS",
        subgrupo: "CORTES NOBRES",
        occurrences: 6,
        forecast_val: 500,
        forecast_min: 380,
        forecast_max: 610,
      },
      {
        // A single occurrence: min === val === max, shown individually
        // (no aggregate "outros" bucket).
        prod_code: "2",
        prod_name: "COSTELA",
        secao: "CARNES E AVES",
        grupo: "BOVINOS",
        subgrupo: "CORTES NOBRES",
        occurrences: 1,
        forecast_val: 90,
        forecast_min: 90,
        forecast_max: 90,
      },
    ],
    [{ secao: "CARNES E AVES" }, { secao: "BACALHAU" }],
    [{ weekday_num: 6, lookback_occurrences: 8 }],
  ],
];

interface Input {
  storeCode: string;
  targetDate: string;
  secao?: string;
  grupos?: string[];
}
interface Produto {
  prodCode: string;
  grupo: string | null;
  subgrupo: string | null;
  forecastVal: number;
  forecastMin: number;
  forecastMax: number;
}
type Fn = (d: Input) => Promise<{
  secoes: {
    secao: string;
    produtos: Produto[];
    totalSecao: number;
  }[];
  weekdayNum: number;
}>;
const call = (d: Partial<Input> = {}) =>
  (getProductionForecast as unknown as Fn)({
    storeCode: "1516",
    targetDate: "2026-08-14",
    ...d,
  });

beforeEach(() => {
  vi.clearAllMocks();
  cache.destroy();
  (cache as unknown as { store: Map<string, unknown> }).store.clear();
  vi.mocked(assertAdmin).mockResolvedValue(undefined);
  vi.mocked(db.query).mockResolvedValue(PROC_RESULT_MIXED as never);
});

describe("getProductionForecast", () => {
  it("rejects non-admin users before querying the database", async () => {
    vi.mocked(assertAdmin).mockRejectedValueOnce(new Error("Apenas administradores"));

    await expect(call()).rejects.toThrow("Apenas administradores");
    expect(db.query).not.toHaveBeenCalled();
  });

  it("maps every product individually (no confidence floor), tagged with grupo/subgrupo, and reconciles the seção total", async () => {
    const r = await call();
    expect(r.secoes).toHaveLength(2);

    const carnes = r.secoes.find((s) => s.secao === "CARNES E AVES");
    expect(carnes?.produtos).toHaveLength(2);
    expect(carnes?.produtos[0]).toMatchObject({
      prodCode: "1",
      grupo: "BOVINOS",
      subgrupo: "CORTES NOBRES",
      forecastVal: 500,
      forecastMin: 380,
      forecastMax: 610,
    });
    // A product with a single occurrence still gets its own row: min ===
    // val === max, no aggregate bucket hiding it.
    expect(carnes?.produtos[1]).toMatchObject({
      prodCode: "2",
      forecastVal: 90,
      forecastMin: 90,
      forecastMax: 90,
    });
    expect(carnes?.totalSecao).toBe(590);
  });

  it("keeps a section with no products at all present, with R$0 and no produtos", async () => {
    const r = await call();
    const bacalhau = r.secoes.find((s) => s.secao === "BACALHAU");
    expect(bacalhau?.produtos).toHaveLength(0);
    expect(bacalhau?.totalSecao).toBe(0);
  });

  it("returns every section with R$0 for a store/date with no sales at all on this weekday", async () => {
    vi.mocked(db.query).mockResolvedValue([
      [[], [{ secao: "CARNES E AVES" }, { secao: "F.L.V." }], [{ weekday_num: 3 }]],
    ] as never);
    const r = await call();
    expect(r.secoes).toHaveLength(2);
    expect(r.secoes.every((s) => s.totalSecao === 0 && s.produtos.length === 0)).toBe(true);
  });

  describe("cache", () => {
    it("serves the second identical call without touching the database", async () => {
      const a = await call();
      const b = await call();
      expect(db.query).toHaveBeenCalledTimes(1);
      expect(b).toEqual(a);
    });

    it("does not collide across different stores or target dates", async () => {
      await call({ storeCode: "1516" });
      await call({ storeCode: "1274" });
      await call({ targetDate: "2026-08-15" });
      expect(db.query).toHaveBeenCalledTimes(3);
    });

    it("does not collide across different secao/grupos filters", async () => {
      await call({ secao: undefined });
      await call({ secao: "CARNES E AVES" });
      await call({ grupos: ["BOVINOS"] });
      expect(db.query).toHaveBeenCalledTimes(3);
    });
  });

  describe("secao/grupos filters", () => {
    it("passes the filters through to the proc as JSON arrays, defaulting to empty", async () => {
      await call();
      expect(db.query).toHaveBeenCalledWith(expect.any(String), [
        "1516",
        "2026-08-14",
        8,
        "[]",
        "[]",
      ]);
    });

    it("JSON-stringifies a secao plus non-empty grupos for the proc call", async () => {
      await call({ secao: "CARNES E AVES", grupos: ["BOVINOS"] });
      expect(db.query).toHaveBeenCalledWith(expect.any(String), [
        "1516",
        "2026-08-14",
        8,
        '["CARNES E AVES"]',
        '["BOVINOS"]',
      ]);
    });
  });
});

describe("getProductionFilterOptions", () => {
  const callOptions = (storeCode = "1516") =>
    (getProductionFilterOptions as unknown as (d: { storeCode: string }) => Promise<unknown>)({
      storeCode,
    });

  it("rejects non-admin users before querying the database", async () => {
    vi.mocked(assertAdmin).mockRejectedValueOnce(new Error("Apenas administradores"));

    await expect(callOptions()).rejects.toThrow("Apenas administradores");
    expect(db.query).not.toHaveBeenCalled();
  });

  it("maps distinct secao/grupo/subgrupo rows from product_universe", async () => {
    vi.mocked(db.query).mockResolvedValue([
      [
        { secao: "CARNES E AVES", grupo: "BOVINOS", subgrupo: "CORTES NOBRES" },
        { secao: "CARNES E AVES", grupo: "SUINOS", subgrupo: null },
        { secao: "BACALHAU", grupo: null, subgrupo: null },
      ],
    ] as never);
    const r = await callOptions();
    expect(r).toEqual([
      { secao: "CARNES E AVES", grupo: "BOVINOS", subgrupo: "CORTES NOBRES" },
      { secao: "CARNES E AVES", grupo: "SUINOS", subgrupo: null },
      { secao: "BACALHAU", grupo: null, subgrupo: null },
    ]);
  });

  it("serves the second identical call without touching the database", async () => {
    vi.mocked(db.query).mockResolvedValue([
      [{ secao: "CARNES E AVES", grupo: "BOVINOS", subgrupo: "CORTES NOBRES" }],
    ] as never);
    await callOptions();
    await callOptions();
    expect(db.query).toHaveBeenCalledTimes(1);
  });

  it("does not collide across different stores", async () => {
    vi.mocked(db.query).mockResolvedValue([
      [{ secao: "CARNES E AVES", grupo: "BOVINOS", subgrupo: "CORTES NOBRES" }],
    ] as never);
    await callOptions("1516");
    await callOptions("1274");
    expect(db.query).toHaveBeenCalledTimes(2);
  });
});
