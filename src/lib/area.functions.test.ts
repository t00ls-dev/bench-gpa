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

import { getAreaAnalysis } from "./area.functions";
import db from "./db";
import { cache } from "./cache";

// A proc devolve 4 result sets: KPIs, total para paginação, byDate e produtos.
const RESULTADO_DA_PROC = [
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

const FILTROS: AreaInput = {
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
  (getAreaAnalysis as unknown as AreaFn)({ ...FILTROS, ...d });

beforeEach(() => {
  vi.clearAllMocks();
  // Sem isto um caso vaza resultado para o outro pela chave de cache.
  cache.destroy();
  (cache as unknown as { store: Map<string, unknown> }).store.clear();
  vi.mocked(db.query).mockResolvedValue(RESULTADO_DA_PROC as never);
});

describe("getAreaAnalysis", () => {
  it("mapeia os quatro result sets da proc", async () => {
    const r = await call({});
    expect(r.total).toBe(1000);
    expect(r.products).toHaveLength(1);
    expect(r.products[0]).toMatchObject({ prod_code: "1", val: 1000, lastSaleDate: "2026-07-20" });
  });

  // A tela media 2,6s em prod na janela padrão e 23,7s em 28 dias, e batia no
  // banco a cada troca de página, ordenação ou filtro.
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

    // O export para PDF pede a lista inteira: megabytes por entrada, num clique
    // que raramente se repete. Cachear encheria a memória do processo.
    it("não cacheia o caminho do export (pageSize alto)", async () => {
      await call({ pageSize: 999999 });
      await call({ pageSize: 999999 });
      expect(db.query).toHaveBeenCalledTimes(2);
    });
  });
});
