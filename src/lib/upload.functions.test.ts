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
          handler: (fn: Handler) => async (input: unknown) => {
            let ctx = { userId: "admin-u1" };
            for (const m of chain.middlewares) {
              const r = (await m({ next: (c: unknown) => c, context: ctx, data: input })) as
                { context?: unknown } | undefined;
              if (r?.context) ctx = r.context as typeof ctx;
            }
            return fn({ data: input, context: ctx });
          },
        }),
        handler: (fn: Handler) => async (input: unknown) => {
          let ctx = { userId: "admin-u1" };
          for (const m of chain.middlewares) {
            const r = (await m({ next: (c: unknown) => c, context: ctx, data: input })) as
              { context?: unknown } | undefined;
            if (r?.context) ctx = r.context as typeof ctx;
          }
          return fn({ data: input, context: ctx });
        },
      };
    };
    chain.inputValidator = () => chain;
    chain.handler = (fn: Handler) => (input?: unknown) => fn({ data: input, context: {} });
    return chain;
  };
  return { createServerFn: buildChain };
});

vi.mock("./auth-middleware", () => ({
  requireAuth: vi.fn(({ next, context }: { next: (ctx: unknown) => unknown; context: unknown }) =>
    next({ context }),
  ),
}));
vi.mock("./rate-limit.middleware", () => ({
  requireRateLimit: vi.fn(
    () =>
      ({ next, context }: { next: (ctx: unknown) => unknown; context: unknown }) =>
        next({ context }),
  ),
}));
vi.mock("./admin-utils", () => ({ assertAdmin: vi.fn() }));
vi.mock("./db", () => ({ default: { query: vi.fn() } }));

import {
  beginImport,
  insertSalesChunk,
  getImportedDates,
  finalizeImport,
} from "./upload.functions";
import { assertAdmin } from "./admin-utils";
import db from "./db";
import { cache } from "./cache";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(db.query).mockResolvedValue([{ affectedRows: 1 }] as never);
  cache.destroy();
  (cache as unknown as { store: Map<string, unknown> }).store.clear();
});

describe("beginImport", () => {
  const baseInput = {
    sale_date: "2026-07-20",
    batch_id: "b1",
    total_rows: 100,
    stores: [{ store_code: "1516", store_name: "Loja Centro" }],
    products: [{ prod_code: "1", prod_name: "Produto 1" }],
  };

  it("limpa o staging da data, upserta lojas e produtos, retorna ok", async () => {
    const result = await (beginImport as (d: typeof baseInput) => Promise<unknown>)(baseInput);
    expect(result).toEqual({ ok: true, batch_id: "b1" });
    expect(assertAdmin).toHaveBeenCalledWith(expect.anything());
    expect(db.query).toHaveBeenNthCalledWith(1, "DELETE FROM staging_sales WHERE sale_date = ?", [
      "2026-07-20",
    ]);
    expect(db.query).toHaveBeenNthCalledWith(
      2,
      "INSERT INTO stores (store_code, store_name) VALUES (?, ?) ON DUPLICATE KEY UPDATE store_name = VALUES(store_name)",
      ["1516", "Loja Centro"],
    );
    expect(db.query).toHaveBeenNthCalledWith(3, "CALL upsert_products_bulk(?, ?)", [
      JSON.stringify(baseInput.products),
      "2026-07-20",
    ]);
  });

  it("rejeita total_rows zero antes de tocar o banco", async () => {
    await expect(
      (beginImport as (d: typeof baseInput) => Promise<unknown>)({ ...baseInput, total_rows: 0 }),
    ).rejects.toThrow("Nenhuma linha de venda para importar.");
    expect(db.query).not.toHaveBeenCalled();
  });

  it("pula o INSERT de lojas quando stores está vazio", async () => {
    await (beginImport as (d: typeof baseInput) => Promise<unknown>)({ ...baseInput, stores: [] });
    // Só DELETE (staging) + CALL upsert_products_bulk: nenhuma chamada com "INSERT INTO stores".
    expect(db.query).toHaveBeenCalledTimes(2);
    expect(db.query).not.toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO stores"),
      expect.anything(),
    );
  });

  it("pula o upsert de produtos quando products está vazio", async () => {
    await (beginImport as (d: typeof baseInput) => Promise<unknown>)({
      ...baseInput,
      products: [],
    });
    expect(db.query).toHaveBeenCalledTimes(2);
    expect(db.query).not.toHaveBeenCalledWith("CALL upsert_products_bulk(?, ?)", expect.anything());
  });
});

describe("insertSalesChunk", () => {
  it("monta o INSERT posicional via toStagingRow e retorna a contagem", async () => {
    const rows = [
      {
        store_code: "1516",
        store_name: "Loja Centro",
        depto: "MERCEARIA",
        secao: "SECA",
        grupo: "ARROZ",
        subgrupo: null,
        prod_code: "1",
        prod_name: "Arroz 5kg",
        val_vda: 100.5,
      },
    ];
    const result = await (
      insertSalesChunk as (d: {
        sale_date: string;
        batch_id: string;
        rows: typeof rows;
      }) => Promise<{ inserted: number }>
    )({ sale_date: "2026-07-20", batch_id: "b1", rows });

    expect(result).toEqual({ inserted: 1 });
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO staging_sales"),
      // toStagingRow: sale_date, batch_id primeiro, depois as colunas na ordem de STAGING_COLS.
      [
        "2026-07-20",
        "b1",
        "1516",
        "Loja Centro",
        "1",
        "Arroz 5kg",
        "MERCEARIA",
        "SECA",
        "ARROZ",
        null,
        100.5,
      ],
    );
  });

  it("depto/secao/grupo/subgrupo ausentes viram NULL, não 0 (armadilha documentada em staging-row.ts)", async () => {
    const rows = [
      {
        store_code: "1516",
        store_name: "Loja Centro",
        prod_code: "1",
        prod_name: "Produto sem categoria",
        val_vda: 10,
      },
    ];
    await (
      insertSalesChunk as (d: {
        sale_date: string;
        batch_id: string;
        rows: typeof rows;
      }) => Promise<unknown>
    )({ sale_date: "2026-07-20", batch_id: "b1", rows });

    const [, values] = vi.mocked(db.query).mock.calls[0] as unknown as [string, unknown[]];
    // Índices 6-9 de STAGING_COLS são depto/secao/grupo/subgrupo.
    expect(values.slice(6, 10)).toEqual([null, null, null, null]);
  });
});

describe("getImportedDates", () => {
  const proc_result = [
    [[{ sale_date: "2026-07-20", row_count: 1234, imported_at: "2026-07-20 10:00:00" }]],
  ];

  it("mapeia o result set da proc para o shape esperado", async () => {
    vi.mocked(db.query).mockResolvedValueOnce(proc_result as never);
    const result = await (getImportedDates as () => Promise<unknown>)();
    expect(result).toEqual([
      { sale_date: "2026-07-20", row_count: 1234, imported_at: "2026-07-20 10:00:00" },
    ]);
    expect(db.query).toHaveBeenCalledWith("CALL imported_dates()");
  });

  it("usa cache: a segunda chamada não bate no banco de novo", async () => {
    vi.mocked(db.query).mockResolvedValueOnce(proc_result as never);
    await (getImportedDates as () => Promise<unknown>)();
    await (getImportedDates as () => Promise<unknown>)();
    expect(db.query).toHaveBeenCalledTimes(1);
  });
});

describe("finalizeImport", () => {
  // `row_count` aqui é só o parâmetro que o cliente MANDA (parsed.sales.length,
  // calculado antes de qualquer chunk ser de fato inserido). Este teste prova
  // que a função de servidor o repassa como veio, não que ele é confiável. A
  // reconciliação real está dentro da procedure `finalize_import`
  // (migrate-schema.sql): `import_log.row_count` grava `v_staging_count` (a
  // contagem real da staging, já verificada > 0 na mesma procedure), não
  // `p_row_count`: um `db.query` mockado não executa SQL de verdade, então
  // essa parte foi validada manualmente contra MariaDB real (ver
  // docs/auditoria-qa-2026-08-01.md, item 8): `CALL finalize_import(...,
  // 999, ...)` com só 3 linhas reais na staging gravou `row_count = 3` em
  // `import_log`, não 999.
  it("chama finalize_import com batch_id/sale_date/row_count/userId e retorna ok", async () => {
    const result = await (
      finalizeImport as (d: {
        sale_date: string;
        batch_id: string;
        row_count: number;
      }) => Promise<unknown>
    )({ sale_date: "2026-07-20", batch_id: "b1", row_count: 500 });

    expect(result).toEqual({ ok: true });
    expect(assertAdmin).toHaveBeenCalledWith(expect.anything());
    expect(db.query).toHaveBeenCalledWith("CALL finalize_import(?, ?, ?, ?)", [
      "b1",
      "2026-07-20",
      500,
      "admin-u1",
    ]);
  });
});
