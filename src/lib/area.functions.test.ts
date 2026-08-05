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

import { getAreaAnalysis, CACHE_BYPASS_PAGE_SIZE } from "./area.functions";
import db from "./db";
import { cache } from "./cache";
import { AreaAnalysisSchema, EXPORT_PAGE_SIZE } from "./schemas";

// The proc returns 4 result sets: KPIs, total for pagination, byDate and products.
const PROC_RESULT = [
  [
    [{ total: 1000, plus_total: 10, plus_with_sale: 8, plus_without_sale: 2 }],
    [{ total_products: 10 }],
    [{ date: "2026-07-20", val: 1000 }],
    [
      {
        prod_code: "1",
        prod_name: "P1",
        depto: "BAZAR",
        secao: null,
        grupo: null,
        subgrupo: null,
        val: 1000,
        last_sale_date: "2026-07-20",
      },
    ],
  ],
];

interface AreaInput {
  dateFrom: string;
  dateTo: string;
  stores: string[];
  deptos: string[];
  secoes: string[];
  grupos: string[];
  subgrupos: string[];
  page: number;
  pageSize: number;
  search: string;
  sortBy: string;
  sortDir: string;
}

const FILTERS: AreaInput = {
  dateFrom: "2026-07-14",
  dateTo: "2026-07-20",
  stores: [],
  deptos: [],
  secoes: [],
  grupos: [],
  subgrupos: [],
  page: 1,
  pageSize: 50,
  search: "",
  sortBy: "val",
  sortDir: "desc",
};

type AreaFn = (d: AreaInput) => Promise<{ total: number; products: unknown[] }>;
const call = (d: Partial<AreaInput>) =>
  (getAreaAnalysis as unknown as AreaFn)({ ...FILTERS, ...d });

beforeEach(() => {
  vi.clearAllMocks();
  // Without this one case leaks its result into another via the cache key.
  cache.destroy();
  (cache as unknown as { store: Map<string, unknown> }).store.clear();
  vi.mocked(db.query).mockResolvedValue(PROC_RESULT as never);
});

describe("getAreaAnalysis", () => {
  it("mapeia os quatro result sets da proc", async () => {
    const r = await call({});
    expect(r.total).toBe(1000);
    expect(r.products).toHaveLength(1);
    expect(r.products[0]).toMatchObject({ prod_code: "1", val: 1000, lastSaleDate: "2026-07-20" });
  });

  // The screen measures 2.1s in prod on the default window and 23.0s at 28
  // days, and used to hit the database on every page, sort, or filter change.
  describe("cache", () => {
    it("serve a segunda chamada igual sem tocar no banco", async () => {
      const a = await call({});
      const b = await call({});
      expect(db.query).toHaveBeenCalledTimes(1);
      expect(b).toEqual(a);
    });

    it("não colide entre períodos diferentes", async () => {
      await call({});
      await call({ dateFrom: "2026-07-01" });
      expect(db.query).toHaveBeenCalledTimes(2);
    });

    it("não colide entre páginas nem ordenações diferentes", async () => {
      await call({});
      await call({ page: 2 });
      await call({ sortDir: "asc" });
      await call({ search: "arroz" });
      expect(db.query).toHaveBeenCalledTimes(4);
    });

    it("não colide entre filtros de categoria diferentes", async () => {
      await call({ deptos: ["BAZAR"] });
      await call({ deptos: ["MERCEARIA"] });
      expect(db.query).toHaveBeenCalledTimes(2);
    });

    // The PDF export requests the entire list: megabytes per entry, in a
    // click that rarely repeats. Caching it would fill the process's memory.
    it("não cacheia o caminho do export", async () => {
      await call({ pageSize: EXPORT_PAGE_SIZE });
      await call({ pageSize: EXPORT_PAGE_SIZE });
      expect(db.query).toHaveBeenCalledTimes(2);
    });

    it("ainda cacheia exatamente no limiar (só acima dele é que escapa)", async () => {
      await call({ pageSize: CACHE_BYPASS_PAGE_SIZE });
      await call({ pageSize: CACHE_BYPASS_PAGE_SIZE });
      expect(db.query).toHaveBeenCalledTimes(1);
    });
  });

  // Three constants across two files need to agree. If the export ever
  // stops exceeding the threshold, the entire listing silently starts
  // getting cached again and the process's memory grows with PDF usage; if
  // it exceeds the schema's cap, the export breaks with a validation error.
  describe("invariante entre o export, o limiar de cache e o teto do schema", () => {
    it("o export supera o limiar de bypass do cache", () => {
      expect(EXPORT_PAGE_SIZE).toBeGreaterThan(CACHE_BYPASS_PAGE_SIZE);
    });

    it("o export é aceito pelo schema", () => {
      const r = AreaAnalysisSchema.safeParse({
        dateFrom: "2026-07-14",
        dateTo: "2026-07-20",
        pageSize: EXPORT_PAGE_SIZE,
      });
      expect(r.success).toBe(true);
    });

    it("o schema recusa pageSize acima do teto", () => {
      const r = AreaAnalysisSchema.safeParse({
        dateFrom: "2026-07-14",
        dateTo: "2026-07-20",
        pageSize: EXPORT_PAGE_SIZE + 1,
      });
      expect(r.success).toBe(false);
    });

    it("o schema recusa pageSize e page não positivos", () => {
      const base = { dateFrom: "2026-07-14", dateTo: "2026-07-20" };
      expect(AreaAnalysisSchema.safeParse({ ...base, pageSize: 0 }).success).toBe(false);
      expect(AreaAnalysisSchema.safeParse({ ...base, page: -5 }).success).toBe(false);
    });
  });
});
