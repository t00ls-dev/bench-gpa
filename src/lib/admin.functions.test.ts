import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@tanstack/react-start", () => {
  const buildChain = () => {
    const chain: any = { middlewares: [] };
    chain.middleware = (mw: Function[]) => {
      chain.middlewares = mw;
      return {
        inputValidator: () => ({
          handler: (fn: Function) => async (input: unknown) => {
            let ctx = {};
            for (const m of chain.middlewares) {
              const r = await m({ next: (c: unknown) => c, context: ctx, data: input });
              if (r?.context) ctx = r.context;
            }
            return fn({ data: input, context: ctx });
          },
        }),
        handler: (fn: Function) => async (input: unknown) => {
          let ctx = {};
          for (const m of chain.middlewares) {
            const r = await m({ next: (c: unknown) => c, context: ctx, data: input });
            if (r?.context) ctx = r.context;
          }
          return fn({ data: input, context: ctx });
        },
      };
    };
    chain.inputValidator = () => chain;
    chain.handler = (fn: Function) => (input?: unknown) => {
      if (input !== undefined) return fn({ data: input, context: {} });
      return fn({ context: {} });
    };
    return chain;
  };
  return { createServerFn: buildChain };
});

vi.mock("./auth-middleware", () => ({
  requireAuth: vi.fn(({ next, context }: any) => next({ context: { ...context, userId: "admin-u1", userRole: "admin", userEmail: "admin@gpabr.com" } })),
}));

vi.mock("./rate-limit.middleware", () => ({
  requireRateLimit: vi.fn(({ next }: any) => next({})),
}));

vi.mock("./admin-utils", () => ({
  assertAdmin: vi.fn(),
}));

vi.mock("./db", () => ({ default: { query: vi.fn() } }));
vi.mock("bcrypt", () => ({ default: { hash: vi.fn() } }));

import { createUser, resetPassword } from "./admin.functions";
import db from "./db";
import bcrypt from "bcrypt";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(bcrypt.hash).mockResolvedValue("$2b$12$mockedhash" as never);
  vi.mocked(db.query).mockResolvedValue([{ affectedRows: 1 }] as never);
});

describe("createUser", () => {
  it("inserts user with bcrypt hash and returns id", async () => {
    const result = await createUser({ email: "newuser@gpabr.com", name: "New User", password: "Str0ng!Pass", role: "analyst" });
    expect(result.ok).toBe(true);
    expect(result.id).toBeDefined();
    expect(bcrypt.hash).toHaveBeenCalledWith("Str0ng!Pass", 12);
    expect(db.query).toHaveBeenCalledWith(
      "INSERT INTO users (id, email, name, password, role, is_active) VALUES (?, ?, ?, ?, ?, TRUE)",
      [result.id, "newuser@gpabr.com", "New User", "$2b$12$mockedhash", "analyst"],
    );
  });
});

describe("resetPassword", () => {
  it("updates user password with bcrypt hash", async () => {
    const result = await resetPassword({ userId: "u1", password: "N3w!Str0ng" });
    expect(result.ok).toBe(true);
    expect(bcrypt.hash).toHaveBeenCalledWith("N3w!Str0ng", 12);
    expect(db.query).toHaveBeenCalledWith("UPDATE users SET password = ? WHERE id = ?", ["$2b$12$mockedhash", "u1"]);
  });
});
