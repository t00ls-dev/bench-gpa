// Complements upload.functions.test.ts, which mocks `assertAdmin` as a
// no-op and only confirms it was *called*. Here the guard is the real
// one: it proves a non-admin is actually *blocked* before touching
// staging_sales (see docs/auditoria-qa-2026-08-01.md, item 3).
import { describe, it, expect, vi, beforeEach } from "vitest";

type Middleware = (opts: {
  next: (ctx: unknown) => unknown;
  context: unknown;
  data: unknown;
}) => unknown;
type Handler = (opts: { data?: unknown; context: unknown }) => unknown;

vi.mock("@tanstack/react-start", () => {
  const buildChain = () => {
    const chain: { middlewares: Middleware[] } = { middlewares: [] };
    const run = (fn: Handler) => async (input: unknown) => {
      let ctx: unknown = { userId: "user-nao-admin" };
      for (const m of chain.middlewares) {
        const r = (await m({ next: (c: unknown) => c, context: ctx, data: input })) as
          { context?: unknown } | undefined;
        if (r?.context) ctx = r.context;
      }
      return fn({ data: input, context: ctx });
    };
    return {
      middleware: (mw: Middleware[]) => {
        chain.middlewares = mw;
        // The real Zod validation doesn't matter here: assertAdmin runs
        // before any use of `data` in the handler, so the input is never
        // actually examined, it just needs to exist.
        return {
          inputValidator: () => ({ handler: (fn: Handler) => run(fn) }),
          handler: (fn: Handler) => run(fn),
        };
      },
    };
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
// admin-utils is NOT mocked: it's exactly what this suite actually proves.
vi.mock("./db", () => ({ default: { query: vi.fn() } }));

import { beginImport } from "./upload.functions";
import db from "./db";

beforeEach(() => {
  vi.mocked(db.query).mockReset();
});

describe("beginImport: real admin guard (assertAdmin not mocked)", () => {
  it("rejects a non-admin user without touching staging_sales", async () => {
    vi.mocked(db.query).mockResolvedValueOnce([[[{ has_role: 0 }]]] as never); // CALL has_role

    await expect(
      (beginImport as (input: unknown) => Promise<unknown>)({
        data: {
          sale_date: "2026-08-01",
          batch_id: "b1",
          total_rows: 5,
          stores: [],
          products: [],
        },
      }),
    ).rejects.toThrow("Apenas administradores");
    // Only assertAdmin's own check ran: the DELETE on staging_sales (which
    // would wipe the day's data for any caller) never fired.
    expect(db.query).toHaveBeenCalledTimes(1);
    expect(db.query).toHaveBeenCalledWith("CALL has_role(?, ?)", ["user-nao-admin", "admin"]);
  });
});
