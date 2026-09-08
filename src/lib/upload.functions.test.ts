import { describe, it, expect, vi, beforeEach } from "vitest";

const mockConnection = vi.hoisted(() => ({
  beginTransaction: vi.fn(),
  query: vi.fn(),
  commit: vi.fn(),
  rollback: vi.fn(),
  release: vi.fn(),
}));

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
vi.mock("./db", () => ({
  default: { query: vi.fn(), getConnection: vi.fn(async () => mockConnection) },
}));

import {
  beginImport,
  cancelImport,
  insertSalesChunk,
  getImportHistory,
  getImportedDates,
  finalizeImport,
} from "./upload.functions";
import { assertAdmin } from "./admin-utils";
import db from "./db";
import { cache } from "./cache";
import { getSentryContext, isExpectedError } from "./sentry-error-metadata";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(db.query).mockResolvedValue([{ affectedRows: 1 }] as never);
  mockConnection.beginTransaction.mockResolvedValue(undefined);
  mockConnection.query.mockResolvedValue([{ affectedRows: 1 }] as never);
  mockConnection.commit.mockResolvedValue(undefined);
  mockConnection.rollback.mockResolvedValue(undefined);
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
    replace_existing: false,
  };

  it("acquires the global lock and returns ok", async () => {
    const result = await (beginImport as (d: typeof baseInput) => Promise<unknown>)(baseInput);
    expect(result).toEqual({ ok: true, batch_id: "b1" });
    expect(assertAdmin).toHaveBeenCalledWith(expect.anything());
    expect(db.query).toHaveBeenNthCalledWith(
      1,
      "CALL acquire_import_lock_checked(?, ?, ?, ?, ?, ?)",
      [
        "b1",
        "2026-07-20",
        "admin-u1",
        JSON.stringify(baseInput.stores),
        JSON.stringify(baseInput.products),
        false,
      ],
    );
    expect(db.query).toHaveBeenCalledTimes(1);
  });

  it("rejects total_rows zero before touching the database", async () => {
    await expect(
      (beginImport as (d: typeof baseInput) => Promise<unknown>)({ ...baseInput, total_rows: 0 }),
    ).rejects.toThrow("Nenhuma linha de venda para importar.");
    expect(db.query).not.toHaveBeenCalled();
  });

  it("maps an occupied lock to a user-facing error without releasing its owner", async () => {
    vi.mocked(db.query).mockRejectedValueOnce(new Error("IMPORT_IN_PROGRESS") as never);

    await expect(
      (beginImport as (d: typeof baseInput) => Promise<unknown>)(baseInput),
    ).rejects.toSatisfy(
      (error: unknown) =>
        error instanceof Error &&
        error.message.includes("Outra importação está em andamento") &&
        isExpectedError(error),
    );
    expect(db.query).toHaveBeenCalledTimes(1);
  });

  it("passes explicit replacement consent", async () => {
    await (beginImport as (d: typeof baseInput) => Promise<unknown>)({
      ...baseInput,
      replace_existing: true,
    });
    expect(db.query).toHaveBeenCalledWith(
      "CALL acquire_import_lock_checked(?, ?, ?, ?, ?, ?)",
      expect.arrayContaining(["b1", "2026-07-20", "admin-u1", true]),
    );
  });

  it("maps an existing-date rejection to a user-facing error", async () => {
    vi.mocked(db.query).mockRejectedValueOnce(new Error("IMPORT_DATE_EXISTS") as never);

    await expect(
      (beginImport as (d: typeof baseInput) => Promise<unknown>)(baseInput),
    ).rejects.toSatisfy(
      (error: unknown) =>
        error instanceof Error &&
        error.message.includes("A data já foi importada") &&
        isExpectedError(error),
    );
  });
});

describe("insertSalesChunk", () => {
  it("builds the positional INSERT via toStagingRow and returns the count", async () => {
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
    expect(mockConnection.beginTransaction).toHaveBeenCalledOnce();
    expect(mockConnection.query).toHaveBeenNthCalledWith(1, "CALL renew_import_lock(?, ?, ?)", [
      "b1",
      "2026-07-20",
      "admin-u1",
    ]);
    expect(mockConnection.query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("INSERT INTO staging_sales"),
      // toStagingRow: sale_date, batch_id first, then the columns in STAGING_COLS order.
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
    expect(mockConnection.commit).toHaveBeenCalledOnce();
    expect(mockConnection.release).toHaveBeenCalledOnce();
  });

  it("missing depto/secao/grupo/subgrupo become NULL, not 0 (trap documented in staging-row.ts)", async () => {
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

    const [, values] = mockConnection.query.mock.calls[1] as unknown as [string, unknown[]];
    // Indexes 6-9 of STAGING_COLS are depto/secao/grupo/subgrupo.
    expect(values.slice(6, 10)).toEqual([null, null, null, null]);
  });

  it("does not insert when the lease was lost", async () => {
    mockConnection.query.mockRejectedValueOnce(new Error("IMPORT_LEASE_LOST") as never);

    await expect(
      (
        insertSalesChunk as (d: {
          sale_date: string;
          batch_id: string;
          rows: Array<Record<string, unknown>>;
        }) => Promise<unknown>
      )({
        sale_date: "2026-07-20",
        batch_id: "b1",
        rows: [
          {
            store_code: "1516",
            store_name: "Loja",
            prod_code: "1",
            prod_name: "Produto",
            val_vda: 1,
          },
        ],
      }),
    ).rejects.toThrow("perdeu o bloqueio exclusivo");
    expect(mockConnection.query).toHaveBeenCalledTimes(1);
    expect(mockConnection.rollback).toHaveBeenCalledOnce();
    expect(mockConnection.release).toHaveBeenCalledOnce();
  });

  it("rolls back and releases the connection when the INSERT fails", async () => {
    mockConnection.query
      .mockResolvedValueOnce([{ affectedRows: 1 }] as never)
      .mockRejectedValueOnce(new Error("insert failed") as never);

    await expect(
      (
        insertSalesChunk as (d: {
          sale_date: string;
          batch_id: string;
          rows: Array<Record<string, unknown>>;
        }) => Promise<unknown>
      )({
        sale_date: "2026-07-20",
        batch_id: "b1",
        rows: [
          {
            store_code: "1516",
            store_name: "Loja",
            prod_code: "1",
            prod_name: "Produto",
            val_vda: 1,
          },
        ],
      }),
    ).rejects.toThrow("insert failed");
    expect(mockConnection.rollback).toHaveBeenCalledOnce();
    expect(mockConnection.commit).not.toHaveBeenCalled();
    expect(mockConnection.release).toHaveBeenCalledOnce();
  });
});

describe("getImportedDates", () => {
  const proc_result = [
    [[{ sale_date: "2026-07-20", row_count: 1234, imported_at: "2026-07-20 10:00:00" }]],
  ];

  it("maps the proc's result set to the expected shape", async () => {
    vi.mocked(db.query).mockResolvedValueOnce(proc_result as never);
    const result = await (getImportedDates as () => Promise<unknown>)();
    expect(result).toEqual([
      { sale_date: "2026-07-20", row_count: 1234, imported_at: "2026-07-20 10:00:00" },
    ]);
    expect(db.query).toHaveBeenCalledWith("CALL imported_dates()");
  });

  it("uses cache: the second call doesn't hit the database again", async () => {
    vi.mocked(db.query).mockResolvedValueOnce(proc_result as never);
    await (getImportedDates as () => Promise<unknown>)();
    await (getImportedDates as () => Promise<unknown>)();
    expect(db.query).toHaveBeenCalledTimes(1);
  });
});

describe("getImportHistory", () => {
  const ROW = {
    sale_date: "2026-07-20",
    row_count: 1234,
    imported_at: "2026-07-20 10:00:00",
  };

  it("uses the default page size and maps the result", async () => {
    vi.mocked(db.query)
      .mockResolvedValueOnce([[ROW]] as never)
      .mockResolvedValueOnce([[{ total: 1 }]] as never);

    const result = await (
      getImportHistory as (data: object) => Promise<{
        records: (typeof ROW)[];
        total: number;
        limit: number;
        offset: number;
      }>
    )({});

    expect(result).toEqual({ records: [ROW], total: 1, limit: 25, offset: 0 });
    expect(assertAdmin).toHaveBeenCalledWith(expect.anything());
    expect(db.query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining("ORDER BY sale_date DESC, id DESC"),
      [25, 0],
    );
  });

  it("searches displayed and raw values with escaped wildcards", async () => {
    vi.mocked(db.query)
      .mockResolvedValueOnce([[ROW]] as never)
      .mockResolvedValueOnce([[{ total: 1 }]] as never);

    await (
      getImportHistory as (data: {
        search: string;
        sortBy: "imported_at";
        sortDir: "asc";
        limit: number;
        offset: number;
      }) => Promise<unknown>
    )({ search: "20%_", sortBy: "imported_at", sortDir: "asc", limit: 50, offset: 50 });

    const searchValue = "%20=%=_%";
    expect(db.query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining("ORDER BY imported_at ASC, id DESC"),
      [...Array<string>(7).fill(searchValue), 50, 50],
    );
    expect(db.query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining(
        "DATE_FORMAT(CONVERT_TZ(imported_at, '+00:00', '-03:00'), '%d/%m/%y %H:%i')",
      ),
      Array<string>(7).fill(searchValue),
    );
  });
});

describe("finalizeImport", () => {
  // The server passes the expected count through; finalize_import compares
  // it with the measured staging count inside the same transaction that
  // replaces aggregates.
  it("calls finalize_import with batch_id/sale_date/row_count/userId and returns ok", async () => {
    cache.set("imported_dates", [{ sale_date: "2026-07-19" }]);
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
    expect(cache.get("imported_dates")).toBeUndefined();
  });

  it("maps a row count mismatch to a user-facing integrity error", async () => {
    cache.set("imported_dates", [{ sale_date: "2026-07-19" }]);
    vi.mocked(db.query)
      .mockRejectedValueOnce(new Error("IMPORT_ROW_COUNT_MISMATCH") as never)
      .mockResolvedValueOnce([[{ total: 499 }]] as never);

    const promise = (
      finalizeImport as (d: {
        sale_date: string;
        batch_id: string;
        row_count: number;
      }) => Promise<unknown>
    )({ sale_date: "2026-07-20", batch_id: "b1", row_count: 500 });

    await expect(promise).rejects.toSatisfy((error: unknown) => {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toContain("Nenhum dado foi publicado");
      expect(getSentryContext(error)).toEqual({
        name: "import_integrity",
        values: {
          batch_id: "b1",
          sale_date: "2026-07-20",
          expected_rows: 500,
          staging_rows: 499,
        },
      });
      return true;
    });
    expect(cache.get("imported_dates")).toBeUndefined();
    expect(db.query).toHaveBeenNthCalledWith(
      2,
      "SELECT COUNT(*) AS total FROM staging_sales WHERE batch_id = ? AND sale_date = ?",
      ["b1", "2026-07-20"],
    );
  });
});

describe("cancelImport", () => {
  it("releases only the authenticated user's batch", async () => {
    const result = await (cancelImport as (d: { batch_id: string }) => Promise<{ ok: true }>)({
      batch_id: "b1",
    });

    expect(result).toEqual({ ok: true });
    expect(assertAdmin).toHaveBeenCalledWith(expect.anything());
    expect(db.query).toHaveBeenCalledWith("CALL release_import_lock(?, ?)", ["b1", "admin-u1"]);
  });
});
