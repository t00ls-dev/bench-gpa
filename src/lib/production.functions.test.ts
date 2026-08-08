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

import { getProductionForecast } from "./production.functions";
import db from "./db";
import { cache } from "./cache";

// The proc returns 4 result sets: individual products, outros-per-section,
// every section of PERECIVEIS from product_universe, and metadata.
const PROC_RESULT_MIXED = [
  [
    [
      {
        prod_code: "1",
        prod_name: "PICANHA",
        secao: "CARNES E AVES",
        occurrences: 6,
        forecast_val: 500,
      },
    ],
    [{ secao: "CARNES E AVES", num_produtos: 3, outros_val: 90 }],
    [{ secao: "CARNES E AVES" }, { secao: "BACALHAU" }],
    [{ weekday_num: 6, min_occurrences: 4, lookback_occurrences: 8 }],
  ],
];

interface Input {
  storeCode: string;
  targetDate: string;
}
type Fn = (d: Input) => Promise<{
  secoes: {
    secao: string;
    produtos: unknown[];
    outrosVal: number;
    outrosNumProdutos: number;
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
  vi.mocked(db.query).mockResolvedValue(PROC_RESULT_MIXED as never);
});

describe("getProductionForecast", () => {
  it("maps individual products, outros, and reconciles the section total", async () => {
    const r = await call();
    expect(r.secoes).toHaveLength(2);

    const carnes = r.secoes.find((s) => s.secao === "CARNES E AVES");
    expect(carnes?.produtos).toHaveLength(1);
    expect(carnes?.produtos[0]).toMatchObject({ prodCode: "1", forecastVal: 500 });
    expect(carnes?.outrosVal).toBe(90);
    expect(carnes?.outrosNumProdutos).toBe(3);
    // Reconciliation: sum of individual + outros = total, by construction.
    expect(carnes?.totalSecao).toBe(590);
  });

  it("keeps a section with no products at all present, with R$0 and no 'outros' line", async () => {
    const r = await call();
    const bacalhau = r.secoes.find((s) => s.secao === "BACALHAU");
    expect(bacalhau?.produtos).toHaveLength(0);
    expect(bacalhau?.outrosNumProdutos).toBe(0);
    expect(bacalhau?.totalSecao).toBe(0);
  });

  it("handles a section that's only individual products (no outros)", async () => {
    vi.mocked(db.query).mockResolvedValue([
      [
        [{ prod_code: "1", prod_name: "P1", secao: "PADARIA", occurrences: 5, forecast_val: 100 }],
        [],
        [{ secao: "PADARIA" }],
        [{ weekday_num: 6, min_occurrences: 4, lookback_occurrences: 8 }],
      ],
    ] as never);
    const r = await call();
    expect(r.secoes[0]).toMatchObject({ secao: "PADARIA", outrosVal: 0, totalSecao: 100 });
  });

  it("handles a section that's only outros (no product reaches the confidence floor)", async () => {
    vi.mocked(db.query).mockResolvedValue([
      [
        [],
        [{ secao: "PEIXARIA", num_produtos: 12, outros_val: 340 }],
        [{ secao: "PEIXARIA" }],
        [{ weekday_num: 6, min_occurrences: 4, lookback_occurrences: 8 }],
      ],
    ] as never);
    const r = await call();
    expect(r.secoes[0]).toMatchObject({
      secao: "PEIXARIA",
      produtos: [],
      outrosNumProdutos: 12,
      totalSecao: 340,
    });
  });

  it("returns every section with R$0 for a store/date with no sales at all on this weekday", async () => {
    vi.mocked(db.query).mockResolvedValue([
      [[], [], [{ secao: "CARNES E AVES" }, { secao: "F.L.V." }], [{ weekday_num: 3 }]],
    ] as never);
    const r = await call();
    expect(r.secoes).toHaveLength(2);
    expect(r.secoes.every((s) => s.totalSecao === 0)).toBe(true);
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
  });
});
