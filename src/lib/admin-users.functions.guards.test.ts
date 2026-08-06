// Complements admin-users.functions.test.ts, which mocks `assertAdmin` as
// a no-op and only confirms it was *called*. Here the guard is the real
// one: it proves a non-admin is actually *blocked* before listing users
// (see docs/auditoria-qa-2026-08-01.md, item 3).
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

import { listUsers } from "./admin-users.functions";
import db from "./db";

beforeEach(() => {
  vi.mocked(db.query).mockReset();
});

describe("listUsers: real admin guard (assertAdmin not mocked)", () => {
  it("rejects a non-admin user without querying the users table", async () => {
    vi.mocked(db.query).mockResolvedValueOnce([[[{ has_role: 0 }]]] as never); // CALL has_role

    await expect((listUsers as () => Promise<unknown>)()).rejects.toThrow("Apenas administradores");
    // Only assertAdmin's own check ran: the SELECT on `users` (which would
    // leak everyone's username/employee_id/role) never fired.
    expect(db.query).toHaveBeenCalledTimes(1);
    expect(db.query).toHaveBeenCalledWith("CALL has_role(?, ?)", ["user-nao-admin", "admin"]);
  });
});
