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
                { context?: unknown } | undefined;
              if (r?.context) ctx = r.context;
            }
            return fn({ data: input, context: ctx });
          },
        }),
        handler: (fn: Handler) => async (input: unknown) => {
          let ctx = {};
          for (const m of chain.middlewares) {
            const r = (await m({ next: (c: unknown) => c, context: ctx, data: input })) as
              { context?: unknown } | undefined;
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
        userUsername: "admin",
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
vi.mock("./audit", () => ({ recordAudit: vi.fn() }));

import {
  createUser,
  resetPassword,
  setUserRole,
  setUserActive,
  updateUserIdentifiers,
} from "./admin-users.functions";
import { invalidateAdminCache } from "./admin-utils";
import { recordAudit } from "./audit";
import db from "./db";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(db.query).mockResolvedValue([{ affectedRows: 1 }] as never);
  vi.mocked(recordAudit).mockResolvedValue(undefined);
});

describe("createUser", () => {
  type CreateUserInput = {
    username?: string;
    employeeId?: string;
    name: string;
    role: string;
  };
  const call = createUser as (d: CreateUserInput) => Promise<{ ok: boolean; id: string }>;

  it("inserts a user without a password (password stays NULL, no bcrypt.hash on this path)", async () => {
    const result = await call({
      username: "novo.usuario",
      employeeId: "5001",
      name: "New User",
      role: "user",
    });
    expect(result.ok).toBe(true);
    expect(result.id).toBeDefined();
    expect(db.query).toHaveBeenCalledWith(
      "INSERT INTO users (id, username, employee_id, name, role, is_active) VALUES (?, ?, ?, ?, ?, TRUE)",
      [result.id, "novo.usuario", "5001", "New User", "user"],
    );
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "user.create", detail: "papel: user" }),
    );
  });

  it("accepts only username (employee_id stays NULL, pending the admin completing it later)", async () => {
    const result = await call({ username: "novo.usuario", name: "New User", role: "user" });
    expect(db.query).toHaveBeenCalledWith(
      "INSERT INTO users (id, username, employee_id, name, role, is_active) VALUES (?, ?, ?, ?, ?, TRUE)",
      [result.id, "novo.usuario", null, "New User", "user"],
    );
  });

  it("accepts only employee_id (username stays NULL, pending the admin completing it later)", async () => {
    const result = await call({ employeeId: "5001", name: "New User", role: "user" });
    expect(db.query).toHaveBeenCalledWith(
      "INSERT INTO users (id, username, employee_id, name, role, is_active) VALUES (?, ?, ?, ?, ?, TRUE)",
      [result.id, null, "5001", "New User", "user"],
    );
  });
});

describe("resetPassword", () => {
  it("clears password and password_changed_at, increments token_version, without receiving a new password", async () => {
    const result = await (resetPassword as (d: { userId: string }) => Promise<{ ok: boolean }>)({
      userId: "u1",
    });
    expect(result.ok).toBe(true);
    // Reuses the "first access pending" state instead of setting a
    // temporary password: same column zeroed out as when a new user is created.
    expect(db.query).toHaveBeenCalledWith(
      "UPDATE users SET password = NULL, password_changed_at = NULL, token_version = token_version + 1 WHERE id = ?",
      ["u1"],
    );
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "user.password_reset",
        detail: "senha zerada, primeiro acesso obrigatório no próximo login",
      }),
    );
  });
});

describe("updateUserIdentifiers", () => {
  it("updates username and employee_id", async () => {
    const result = await (
      updateUserIdentifiers as (d: {
        userId: string;
        username: string;
        employeeId: string;
      }) => Promise<{ ok: boolean }>
    )({ userId: "u1", username: "novo.nome", employeeId: "9999" });
    expect(result.ok).toBe(true);
    expect(db.query).toHaveBeenCalledWith(
      "UPDATE users SET username = ?, employee_id = ? WHERE id = ?",
      ["novo.nome", "9999", "u1"],
    );
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "user.identifiers_update" }),
    );
  });

  it("translates a uniqueness conflict (ER_DUP_ENTRY) into a friendly message", async () => {
    const dupError = Object.assign(new Error("Duplicate entry"), { code: "ER_DUP_ENTRY" });
    vi.mocked(db.query).mockRejectedValueOnce(dupError);
    await expect(
      (
        updateUserIdentifiers as (d: {
          userId: string;
          username: string;
          employeeId: string;
        }) => Promise<unknown>
      )({ userId: "u1", username: "ja.existe", employeeId: "1" }),
    ).rejects.toThrow("Username ou matrícula já usados por outra conta.");
  });
});

describe("detail recorded in the audit log", () => {
  it("setUserRole records the new role", async () => {
    await (setUserRole as (d: { userId: string; role: string }) => Promise<unknown>)({
      userId: "u-alvo",
      role: "admin",
    });
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "user.role_change", detail: "novo papel: admin" }),
    );
  });

  it("setUserActive(true) records user.activate with no detail", async () => {
    await (setUserActive as (d: { userId: string; isActive: boolean }) => Promise<unknown>)({
      userId: "u-alvo",
      isActive: true,
    });
    const call = vi.mocked(recordAudit).mock.calls[0][0];
    expect(call.action).toBe("user.activate");
    expect(call.detail).toBeUndefined();
  });

  it("setUserActive(false) records user.deactivate with no detail", async () => {
    await (setUserActive as (d: { userId: string; isActive: boolean }) => Promise<unknown>)({
      userId: "u-alvo",
      isActive: false,
    });
    const call = vi.mocked(recordAudit).mock.calls[0][0];
    expect(call.action).toBe("user.deactivate");
    expect(call.detail).toBeUndefined();
  });

  it("blocks self-deactivation before recording any audit entry", async () => {
    await expect(
      (setUserActive as (d: { userId: string; isActive: boolean }) => Promise<unknown>)({
        userId: "admin-u1",
        isActive: false,
      }),
    ).rejects.toThrow("não pode inativar sua própria conta");
    expect(recordAudit).not.toHaveBeenCalled();
  });
});

describe("admin cache invalidation", () => {
  it("setUserRole discards the target's cached verdict", async () => {
    const result = await (
      setUserRole as (d: { userId: string; role: string }) => Promise<{ ok: boolean }>
    )({ userId: "u-alvo", role: "admin" });
    expect(result.ok).toBe(true);
    expect(invalidateAdminCache).toHaveBeenCalledWith("u-alvo");
  });

  it("setUserActive discards the target's cached verdict", async () => {
    const result = await (
      setUserActive as (d: { userId: string; isActive: boolean }) => Promise<{ ok: boolean }>
    )({ userId: "u-alvo", isActive: false });
    expect(result.ok).toBe(true);
    expect(invalidateAdminCache).toHaveBeenCalledWith("u-alvo");
  });

  it("invalidates nothing when the action itself is refused", async () => {
    // Self-demotion is blocked before the UPDATE; the cache must not be touched.
    await expect(
      (setUserRole as (d: { userId: string; role: string }) => Promise<unknown>)({
        userId: "admin-u1",
        role: "user",
      }),
    ).rejects.toThrow("não pode remover seu próprio acesso");
    expect(invalidateAdminCache).not.toHaveBeenCalled();
  });
});
