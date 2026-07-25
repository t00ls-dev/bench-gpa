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

import { getDashboardRankings } from "./dashboard.functions";
import db from "./db";
import { cache } from "./cache";

// A proc devolve 5 rankings: depto, seção, grupo, subgrupo e produto.
const RESULTADO_DA_PROC = [
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

const FILTROS: RankingsInput = {
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
  (getDashboardRankings as unknown as RankFn)({ ...FILTROS, ...d });

beforeEach(() => {
  vi.clearAllMocks();
  cache.destroy();
  (cache as unknown as { store: Map<string, unknown> }).store.clear();
  vi.mocked(db.query).mockResolvedValue(RESULTADO_DA_PROC as never);
});

describe("getDashboardRankings", () => {
  it("mapeia os cinco rankings da proc", async () => {
    const r = await call({});
    expect(r.byDepto).toEqual([{ name: "BAZAR", val: 500 }]);
    expect(r.byProduto).toEqual([{ code: "1", name: "P1", val: 90 }]);
  });

  // Era a única metade da tela inicial ainda sem cache — o dashboard_metrics já
  // era cacheado pelo callMetrics. Media 3,8s em prod na janela padrão.
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
