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
            let ctx = { userId: "admin-u1", userUsername: "admin" };
            for (const m of chain.middlewares) {
              const r = (await m({ next: (c: unknown) => c, context: ctx, data: input })) as
                { context?: unknown } | undefined;
              if (r?.context) ctx = r.context as typeof ctx;
            }
            return fn({ data: input, context: ctx });
          },
        }),
        handler: (fn: Handler) => async (input: unknown) => {
          let ctx = { userId: "admin-u1", userUsername: "admin" };
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
  diagnoseData,
  purgeOldAggs,
  dbHealthCheck,
  getAuditLog,
  getHeartbeats,
} from "./admin-system.functions";
import { assertAdmin } from "./admin-utils";
import db from "./db";

beforeEach(() => {
  vi.mocked(db.query).mockReset();
  vi.mocked(assertAdmin).mockReset();
});

describe("diagnoseData", () => {
  it("conta as 6 tabelas e lista as datas distintas do staging", async () => {
    vi.mocked(db.query)
      .mockResolvedValueOnce([[{ count: 100 }]] as never) // staging_sales
      .mockResolvedValueOnce([[{ count: 200 }]] as never) // sales_daily_agg
      .mockResolvedValueOnce([[{ count: 300 }]] as never) // products
      .mockResolvedValueOnce([[{ count: 12 }]] as never) // stores
      .mockResolvedValueOnce([[{ count: 50 }]] as never) // filter_hierarchy
      .mockResolvedValueOnce([[{ count: 60 }]] as never) // import_log
      .mockResolvedValueOnce([[{ sale_date: "2026-07-20" }, { sale_date: "2026-07-19" }]] as never); // dates_in_sales

    const result = await (diagnoseData as () => Promise<Record<string, unknown>>)();

    expect(assertAdmin).toHaveBeenCalled();
    expect(result).toEqual({
      staging_sales: 100,
      sales_daily_agg: 200,
      products: 300,
      stores: 12,
      filter_hierarchy: 50,
      import_log: 60,
      dates_in_sales: ["2026-07-19", "2026-07-20"],
    });
  });
});

describe("purgeOldAggs", () => {
  it("chama purge_old_aggs, registra auditoria e retorna quantos registros saíram", async () => {
    vi.mocked(db.query)
      .mockResolvedValueOnce([[{ deleted: 42 }]] as never) // CALL purge_old_aggs
      .mockResolvedValueOnce([{ affectedRows: 1 }] as never); // INSERT INTO audit_log

    const result = await (purgeOldAggs as () => Promise<{ deleted: number }>)();

    expect(result).toEqual({ deleted: 42 });
    expect(assertAdmin).toHaveBeenCalled();
    expect(db.query).toHaveBeenNthCalledWith(1, "CALL purge_old_aggs(?)", [180]);
    expect(db.query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("INSERT INTO audit_log"),
      expect.arrayContaining(["admin-u1", "admin"]),
    );
  });
});

describe("dbHealthCheck", () => {
  it("mapeia versão, tamanho do banco, tabelas e conexões ativas", async () => {
    vi.mocked(db.query)
      .mockResolvedValueOnce([
        [
          [{ version: "11.4.12-MariaDB" }],
          [{ db_size_mb: 100 }],
          [{ table_name: "sales_prod_daily_agg", size_mb: 50, row_estimate: 2750601 }],
        ],
      ] as never) // CALL db_health_check
      .mockResolvedValueOnce([[{ cnt: 3 }]] as never); // active connections

    const result = await (
      dbHealthCheck as () => Promise<{
        version: string;
        db_size: number;
        active_connections: number;
        tables: { table: string; total_size_pretty: string; row_estimate: number }[];
      }>
    )();

    expect(assertAdmin).toHaveBeenCalled();
    expect(result.version).toBe("11.4.12-MariaDB");
    expect(result.db_size).toBe(100 * 1024 * 1024);
    expect(result.active_connections).toBe(3);
    expect(result.tables).toEqual([
      {
        table: "sales_prod_daily_agg",
        schema: "public",
        total_size: 50 * 1024 * 1024,
        total_size_pretty: "50.0 MB",
        row_estimate: 2750601,
      },
    ]);
  });
});

describe("getAuditLog", () => {
  const ROW = {
    id: 1,
    created_at: "2026-07-30 10:00:00",
    actor_username: "admin",
    action: "data.purge",
    target_type: "data",
    target_id: null,
    target_username: null,
    detail: "purge manual",
    ip: "203.0.113.5",
  };

  it("usa limit/offset default (50/0) quando não informados", async () => {
    vi.mocked(db.query)
      .mockResolvedValueOnce([[ROW]] as never)
      .mockResolvedValueOnce([[{ total: 1 }]] as never);

    const result = await (
      getAuditLog as (d: object) => Promise<{
        events: unknown[];
        total: number;
        limit: number;
        offset: number;
      }>
    )({});

    expect(result.limit).toBe(50);
    expect(result.offset).toBe(0);
    expect(result.total).toBe(1);
    expect(result.events).toEqual([ROW]);
    expect(db.query).toHaveBeenNthCalledWith(1, expect.stringContaining("FROM audit_log"), [50, 0]);
  });

  it("respeita limit/offset informados e trata campos nulos como null", async () => {
    const rowWithNullFields = { ...ROW, actor_username: null, target_id: null, detail: null };
    vi.mocked(db.query)
      .mockResolvedValueOnce([[rowWithNullFields]] as never)
      .mockResolvedValueOnce([[{ total: 200 }]] as never);

    const result = await (
      getAuditLog as (d: {
        limit: number;
        offset: number;
      }) => Promise<{ events: { actor_username: string | null }[] }>
    )({ limit: 10, offset: 20 });

    expect(result.events[0].actor_username).toBeNull();
    expect(db.query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining("FROM audit_log"),
      [10, 20],
    );
  });
});

describe("getHeartbeats", () => {
  it("job sem heartbeat nenhum: overdue e last_run_at null", async () => {
    vi.mocked(db.query).mockResolvedValueOnce([[]] as never);
    const result = await (
      getHeartbeats as () => Promise<
        { job: string; overdue: boolean; last_run_at: string | null }[]
      >
    )();

    const purge = result.find((r) => r.job === "purge")!;
    expect(purge.overdue).toBe(true);
    expect(purge.last_run_at).toBeNull();
  });

  it("job recente e ok, dentro do prazo: não está atrasado", async () => {
    vi.mocked(db.query).mockResolvedValueOnce([
      [
        {
          job: "purge",
          last_run_at: "2026-07-30 03:00:00",
          last_status: "ok",
          last_detail: "0 registros removidos",
          last_duration_ms: 2600,
          age_hours: 1,
        },
      ],
    ] as never);

    const result = await (
      getHeartbeats as () => Promise<
        { job: string; overdue: boolean; last_duration_ms: number | null }[]
      >
    )();
    const purge = result.find((r) => r.job === "purge")!;
    expect(purge.overdue).toBe(false);
    expect(purge.last_duration_ms).toBe(2600);
  });

  it("job com status fail fica atrasado mesmo dentro do prazo de horas", async () => {
    vi.mocked(db.query).mockResolvedValueOnce([
      [
        {
          job: "purge",
          last_run_at: "2026-07-30 03:00:00",
          last_status: "fail",
          last_detail: "erro de conexão",
          last_duration_ms: 100,
          age_hours: 1,
        },
      ],
    ] as never);

    const result = await (getHeartbeats as () => Promise<{ job: string; overdue: boolean }[]>)();
    expect(result.find((r) => r.job === "purge")!.overdue).toBe(true);
  });

  it("job passou do prazo (age_hours > maxHours) fica atrasado mesmo com status ok", async () => {
    vi.mocked(db.query).mockResolvedValueOnce([
      [
        {
          job: "purge",
          last_run_at: "2026-07-27 03:00:00",
          last_status: "ok",
          last_detail: null,
          last_duration_ms: 2600,
          age_hours: 100,
        },
      ],
    ] as never);

    const result = await (getHeartbeats as () => Promise<{ job: string; overdue: boolean }[]>)();
    expect(result.find((r) => r.job === "purge")!.overdue).toBe(true);
  });

  it("devolve uma linha por job conhecido (purge + refresh-universe)", async () => {
    vi.mocked(db.query).mockResolvedValueOnce([[]] as never);
    const result = await (getHeartbeats as () => Promise<{ job: string }[]>)();
    expect(result.map((r) => r.job).sort()).toEqual(["purge", "refresh-universe"]);
  });
});
