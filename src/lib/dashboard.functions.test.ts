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

import {
  getDashboardRankings,
  getFilterOptions,
  getStores,
  getDashboard,
  getLatestSaleInfo,
} from "./dashboard.functions";
import db from "./db";
import { cache } from "./cache";

// The proc returns 5 rankings: depto, secao, grupo, subgrupo and product.
const PROC_RESULT = [
  [
    [{ name: "BAZAR", val: 500 }],
    [{ depto: "BAZAR", name: "SECAO A", val: 300 }],
    [{ depto: "BAZAR", secao: "SECAO A", name: "GRUPO A", val: 200 }],
    [
      {
        depto: "BAZAR",
        secao: "SECAO A",
        grupo: "GRUPO A",
        name: "SUBGRUPO A",
        val: 100,
      },
    ],
    [{ code: "1", name: "P1", val: 90 }],
  ],
];

interface RankingsInput {
  dateFrom: string;
  dateTo: string;
  stores: string[];
  deptos: string[];
  secoes: string[];
  grupos: string[];
  subgrupos: string[];
  limit: number;
}

const FILTERS: RankingsInput = {
  dateFrom: "2026-07-14",
  dateTo: "2026-07-20",
  stores: [],
  deptos: [],
  secoes: [],
  grupos: [],
  subgrupos: [],
  limit: 10,
};

type RankFn = (d: RankingsInput) => Promise<{
  byDepto: unknown[];
  bySecao: unknown[];
  byGrupo: unknown[];
  bySubgrupo: unknown[];
  byProduto: unknown[];
}>;
const call = (d: Partial<RankingsInput>) =>
  (getDashboardRankings as unknown as RankFn)({ ...FILTERS, ...d });

beforeEach(() => {
  vi.clearAllMocks();
  cache.destroy();
  (cache as unknown as { store: Map<string, unknown> }).store.clear();
  vi.mocked(db.query).mockResolvedValue(PROC_RESULT as never);
});

describe("getDashboardRankings", () => {
  it("maps the proc's five rankings", async () => {
    const r = await call({});
    expect(r.byDepto).toEqual([{ name: "BAZAR", val: 500 }]);
    expect(r.bySecao).toEqual([
      {
        name: "SECAO A",
        val: 300,
        depto: "BAZAR",
        secao: "SECAO A",
        grupo: undefined,
        subgrupo: undefined,
        context: "BAZAR",
      },
    ]);
    expect(r.byGrupo).toEqual([
      expect.objectContaining({ depto: "BAZAR", secao: "SECAO A", grupo: "GRUPO A" }),
    ]);
    expect(r.bySubgrupo).toEqual([
      expect.objectContaining({
        depto: "BAZAR",
        secao: "SECAO A",
        grupo: "GRUPO A",
        subgrupo: "SUBGRUPO A",
      }),
    ]);
    expect(r.byProduto).toEqual([{ code: "1", name: "P1", val: 90 }]);
  });

  // This used to be the only half of the home screen still without cache:
  // dashboard_metrics was already cached by callMetrics. It measured 3.8s
  // in prod on the default window, before the proc started scanning the
  // aggregate just once (19.0s at 28 days today).
  describe("cache", () => {
    it("serves the second identical call without touching the database", async () => {
      const a = await call({});
      const b = await call({});
      expect(db.query).toHaveBeenCalledTimes(1);
      expect(b).toEqual(a);
    });

    it("does not collide across different periods, filters, or limits", async () => {
      await call({});
      await call({ dateFrom: "2026-07-01" });
      await call({ deptos: ["BAZAR"] });
      await call({ limit: 25 });
      expect(db.query).toHaveBeenCalledTimes(4);
    });
  });
});

describe("getFilterOptions", () => {
  const PROC_RESULT = [
    [
      [{ latest_date: "2026-07-20" }],
      [{ store_code: "1516", store_name: "Loja Centro" }],
      [{ depto: "MERCEARIA" }],
      [{ secao: "SECA" }],
      [{ grupo: "ARROZ" }],
      [{ subgrupo: "ARROZ BRANCO" }],
      [{ sale_date: "2026-07-20" }, { sale_date: "2026-05-27" }, { sale_date: "2026-06-15" }],
    ],
  ];

  it("maps the 7 result sets and sorts availableDates ascending", async () => {
    vi.mocked(db.query).mockResolvedValueOnce(PROC_RESULT as never);
    const result = await (getFilterOptions as (d: object) => Promise<unknown>)({});
    expect(result).toEqual({
      latestDate: "2026-07-20",
      stores: [{ store_code: "1516", store_name: "Loja Centro" }],
      deptos: ["MERCEARIA"],
      secoes: ["SECA"],
      grupos: ["ARROZ"],
      subgrupos: ["ARROZ BRANCO"],
      // The proc doesn't guarantee ORDER BY surviving schema drift: the
      // array arrives out of order in the fixture and must come out sorted ascending.
      availableDates: ["2026-05-27", "2026-06-15", "2026-07-20"],
    });
  });

  it("calls filter_options with dateFrom/dateTo null when empty and filters serialized", async () => {
    vi.mocked(db.query).mockResolvedValueOnce(PROC_RESULT as never);
    await (getFilterOptions as (d: { stores: string[] }) => Promise<unknown>)({
      stores: ["1516"],
    });
    expect(db.query).toHaveBeenCalledWith("CALL filter_options(?, ?, ?, ?, ?, ?)", [
      null,
      null,
      JSON.stringify(["1516"]),
      "[]",
      "[]",
      "[]",
    ]);
  });

  it("uses cache: the same filter combination doesn't hit the database again", async () => {
    vi.mocked(db.query).mockResolvedValue(PROC_RESULT as never);
    await (getFilterOptions as (d: { stores: string[] }) => Promise<unknown>)({ stores: [] });
    await (getFilterOptions as (d: { stores: string[] }) => Promise<unknown>)({ stores: [] });
    expect(db.query).toHaveBeenCalledTimes(1);
  });

  it("passes real dateFrom/dateTo when provided (doesn't fall back to null)", async () => {
    vi.mocked(db.query).mockResolvedValueOnce(PROC_RESULT as never);
    await (getFilterOptions as (d: { dateFrom: string; dateTo: string }) => Promise<unknown>)({
      dateFrom: "2026-07-01",
      dateTo: "2026-07-20",
    });
    expect(db.query).toHaveBeenCalledWith("CALL filter_options(?, ?, ?, ?, ?, ?)", [
      "2026-07-01",
      "2026-07-20",
      "[]",
      "[]",
      "[]",
      "[]",
    ]);
  });
});

describe("getStores", () => {
  it("lists stores sorted by code", async () => {
    vi.mocked(db.query).mockResolvedValueOnce([
      [
        { store_code: "1516", store_name: "Loja Centro" },
        { store_code: "1629", store_name: "Loja Norte" },
      ],
    ] as never);
    const result = await (getStores as () => Promise<unknown>)();
    expect(result).toEqual([
      { store_code: "1516", store_name: "Loja Centro" },
      { store_code: "1629", store_name: "Loja Norte" },
    ]);
    expect(db.query).toHaveBeenCalledWith(
      "SELECT store_code, store_name FROM stores ORDER BY store_code",
    );
  });

  it("returns an empty array when the database returns no rows", async () => {
    vi.mocked(db.query).mockResolvedValueOnce([undefined] as never);
    const result = await (getStores as () => Promise<unknown>)();
    expect(result).toEqual([]);
  });
});

describe("getDashboard", () => {
  const METRICS_RESULT = [
    [
      [{ total: 1000 }],
      [{ code: "1516", name: "Loja Centro", val: 1000 }],
      [{ name: "MERCEARIA", val: 1000 }],
      [{ date: "2026-07-20", val: 1000 }],
    ],
  ];

  const BASE = {
    dateFrom: "2026-07-14",
    dateTo: "2026-07-20",
    stores: [],
    deptos: [],
    secoes: [],
    grupos: [],
    subgrupos: [],
  };

  it("fetches only the requested period, once", async () => {
    vi.mocked(db.query).mockResolvedValueOnce(METRICS_RESULT as never);
    const result = await (getDashboard as (d: object) => Promise<{ total: number }>)(BASE);
    expect(result.total).toBe(1000);
    expect(db.query).toHaveBeenCalledTimes(1);
  });
});

describe("getLatestSaleInfo", () => {
  it("maps the last recorded import", async () => {
    vi.mocked(db.query).mockResolvedValueOnce([
      [{ sale_date: "2026-07-20", row_count: 12000, imported_at: "2026-07-21 03:00:00" }],
    ] as never);
    const result = await (getLatestSaleInfo as () => Promise<unknown>)();
    expect(result).toEqual({
      sale_date: "2026-07-20",
      row_count: 12000,
      imported_at: "2026-07-21 03:00:00",
    });
  });

  it("returns null when there is no recorded import", async () => {
    vi.mocked(db.query).mockResolvedValueOnce([[]] as never);
    const result = await (getLatestSaleInfo as () => Promise<unknown>)();
    expect(result).toBeNull();
  });
});
