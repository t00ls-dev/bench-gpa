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
    } = {
      middlewares: [],
    };
    chain.middleware = (mw: Middleware[]) => {
      chain.middlewares = mw;
      return {
        inputValidator: () => ({
          handler: (fn: Handler) => async (input: unknown) => {
            let ctx = {};
            for (const m of chain.middlewares) {
              const r = (await m({ next: (c: unknown) => c, context: ctx, data: input })) as
                | { context?: unknown }
                | undefined;
              if (r?.context) ctx = r.context;
            }
            return fn({ data: input, context: ctx });
          },
        }),
        handler: (fn: Handler) => async (input: unknown) => {
          let ctx = {};
          for (const m of chain.middlewares) {
            const r = (await m({ next: (c: unknown) => c, context: ctx, data: input })) as
              | { context?: unknown }
              | undefined;
            if (r?.context) ctx = r.context;
          }
          return fn({ data: input, context: ctx });
        },
      };
    };
    chain.inputValidator = () => chain;
    chain.handler = (fn: Handler) => (input?: unknown) => {
      if (input !== undefined) return fn({ data: input, context: {} });
      return fn({ context: {} });
    };
    return chain;
  };
  return { createServerFn: buildChain };
});

vi.mock("./auth-middleware", () => ({
  requireAuth: vi.fn(({ next, context }: { next: (ctx: unknown) => unknown; context: unknown }) =>
    next({
      context: {
        ...(context as object),
        userId: "admin-u1",
        userRole: "admin",
        userEmail: "admin@gpabr.com",
      },
    }),
  ),
}));

vi.mock("./rate-limit.middleware", () => ({
  requireRateLimit: vi.fn(
    () =>
      ({ next }: { next: (ctx: unknown) => unknown }) =>
        next({}),
  ),
}));

vi.mock("./admin-utils", () => ({
  assertAdmin: vi.fn(),
  invalidateAdminCache: vi.fn(),
}));

vi.mock("./db", () => ({ default: { query: vi.fn() } }));
vi.mock("bcrypt", () => ({ default: { hash: vi.fn() } }));

import { createUser, resetPassword, setUserRole, setUserActive } from "./admin.functions";
import { invalidateAdminCache } from "./admin-utils";
import db from "./db";
import bcrypt from "bcrypt";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(bcrypt.hash).mockResolvedValue("$2b$12$mockedhash" as never);
  vi.mocked(db.query).mockResolvedValue([{ affectedRows: 1 }] as never);
});

describe("createUser", () => {
  it("inserts user with bcrypt hash and returns id", async () => {
    const result = await (
      createUser as (d: {
        email: string;
        name: string;
        password: string;
        role: string;
      }) => Promise<{ ok: boolean; id: string }>
    )({ email: "newuser@gpabr.com", name: "New User", password: "Str0ng!Pass", role: "analyst" });
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
    const result = await (
      resetPassword as (d: { userId: string; password: string }) => Promise<{ ok: boolean }>
    )({ userId: "u1", password: "N3w!Str0ng" });
    expect(result.ok).toBe(true);
    expect(bcrypt.hash).toHaveBeenCalledWith("N3w!Str0ng", 12);
    expect(db.query).toHaveBeenCalledWith("UPDATE users SET password = ? WHERE id = ?", [
      "$2b$12$mockedhash",
      "u1",
    ]);
  });
});

describe("invalidação do cache de admin", () => {
  it("setUserRole descarta o veredito cacheado do alvo", async () => {
    const result = await (
      setUserRole as (d: { userId: string; role: string }) => Promise<{ ok: boolean }>
    )({ userId: "u-alvo", role: "admin" });
    expect(result.ok).toBe(true);
    expect(invalidateAdminCache).toHaveBeenCalledWith("u-alvo");
  });

  it("setUserActive descarta o veredito cacheado do alvo", async () => {
    const result = await (
      setUserActive as (d: { userId: string; isActive: boolean }) => Promise<{ ok: boolean }>
    )({ userId: "u-alvo", isActive: false });
    expect(result.ok).toBe(true);
    expect(invalidateAdminCache).toHaveBeenCalledWith("u-alvo");
  });

  it("não invalida nada quando a própria ação é recusada", async () => {
    // Auto-rebaixamento é barrado antes do UPDATE; o cache não pode ser mexido.
    await expect(
      (setUserRole as (d: { userId: string; role: string }) => Promise<unknown>)({
        userId: "admin-u1",
        role: "user",
      }),
    ).rejects.toThrow("não pode remover seu próprio acesso");
    expect(invalidateAdminCache).not.toHaveBeenCalled();
  });
});
