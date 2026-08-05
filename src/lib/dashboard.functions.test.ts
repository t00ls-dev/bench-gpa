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
    [{ name: "SECAO A", val: 300 }],
    [{ name: "GRUPO A", val: 200 }],
    [{ name: "SUBGRUPO A", val: 100 }],
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

type RankFn = (d: RankingsInput) => Promise<{ byDepto: unknown[]; byProduto: unknown[] }>;
const call = (d: Partial<RankingsInput>) =>
  (getDashboardRankings as unknown as RankFn)({ ...FILTERS, ...d });

beforeEach(() => {
  vi.clearAllMocks();
  cache.destroy();
  (cache as unknown as { store: Map<string, unknown> }).store.clear();
  vi.mocked(db.query).mockResolvedValue(PROC_RESULT as never);
});

describe("getDashboardRankings", () => {
  it("mapeia os cinco rankings da proc", async () => {
    const r = await call({});
    expect(r.byDepto).toEqual([{ name: "BAZAR", val: 500 }]);
    expect(r.byProduto).toEqual([{ code: "1", name: "P1", val: 90 }]);
  });

  // Era a única metade da tela inicial ainda sem cache: o dashboard_metrics já
  // era cacheado pelo callMetrics. Media 3,8s em prod na janela padrão, antes de
  // a proc passar a varrer o agregado uma vez só (19,0s em 28 dias hoje).
  describe("cache", () => {
    it("serve a segunda chamada igual sem tocar no banco", async () => {
      const a = await call({});
      const b = await call({});
      expect(db.query).toHaveBeenCalledTimes(1);
      expect(b).toEqual(a);
    });

    it("não colide entre períodos, filtros ou limites diferentes", async () => {
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

  it("mapeia os 7 result sets e ordena availableDates ascendente", async () => {
    vi.mocked(db.query).mockResolvedValueOnce(PROC_RESULT as never);
    const result = await (getFilterOptions as (d: object) => Promise<unknown>)({});
    expect(result).toEqual({
      latestDate: "2026-07-20",
      stores: [{ store_code: "1516", store_name: "Loja Centro" }],
      deptos: ["MERCEARIA"],
      secoes: ["SECA"],
      grupos: ["ARROZ"],
      subgrupos: ["ARROZ BRANCO"],
      // A proc não garante ORDER BY sobrevivendo a schema drift: o array
      // chega fora de ordem no fixture e tem que sair ordenado ascendente.
      availableDates: ["2026-05-27", "2026-06-15", "2026-07-20"],
    });
  });

  it("chama filter_options com dateFrom/dateTo null quando vazios e filtros serializados", async () => {
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

  it("usa cache: mesma combinação de filtros não bate no banco de novo", async () => {
    vi.mocked(db.query).mockResolvedValue(PROC_RESULT as never);
    await (getFilterOptions as (d: { stores: string[] }) => Promise<unknown>)({ stores: [] });
    await (getFilterOptions as (d: { stores: string[] }) => Promise<unknown>)({ stores: [] });
    expect(db.query).toHaveBeenCalledTimes(1);
  });

  it("passa dateFrom/dateTo reais quando informados (não cai no fallback null)", async () => {
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
  it("lista lojas ordenadas por código", async () => {
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

  it("devolve array vazio quando o banco não retorna rows", async () => {
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

  it("busca só o período pedido, uma vez", async () => {
    vi.mocked(db.query).mockResolvedValueOnce(METRICS_RESULT as never);
    const result = await (getDashboard as (d: object) => Promise<{ total: number }>)(BASE);
    expect(result.total).toBe(1000);
    expect(db.query).toHaveBeenCalledTimes(1);
  });
});

describe("getLatestSaleInfo", () => {
  it("mapeia a última importação registrada", async () => {
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

  it("devolve null quando não há nenhum import registrado", async () => {
    vi.mocked(db.query).mockResolvedValueOnce([[]] as never);
    const result = await (getLatestSaleInfo as () => Promise<unknown>)();
    expect(result).toBeNull();
  });
});
