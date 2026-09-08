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
        validator: () => ({
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
  listUsers,
  resetPassword,
  searchSavedAreaRecipients,
  updateAdminUser,
} from "./admin-users.functions";
import { assertAdmin, invalidateAdminCache } from "./admin-utils";
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

describe("listUsers", () => {
  it("orders the complete set by name and returns the last activity", async () => {
    vi.mocked(db.query).mockResolvedValueOnce([
      [
        {
          id: "u1",
          username: "ana",
          employee_id: "1001",
          name: "Ana",
          role: "user",
          is_active: 1,
          last_activity_at: new Date("2026-08-31T12:00:00Z"),
          pending: 0,
        },
      ],
    ] as never);

    const result = await (listUsers as () => Promise<Array<{ lastActivityAt: string | null }>>)();

    expect(db.query).toHaveBeenCalledWith(expect.stringContaining("ORDER BY name ASC, id ASC"));
    expect(result[0]?.lastActivityAt).toBe("2026-08-31T12:00:00.000Z");
  });
});

describe("searchSavedAreaRecipients", () => {
  it("searches by name, employee id or username and returns only limited recipient fields", async () => {
    vi.mocked(db.query).mockResolvedValueOnce([
      [
        {
          id: "recipient-1",
          username: "maria.silva",
          employee_id: "001234",
          name: "Maria Silva",
        },
      ],
    ] as never);

    const result = await (
      searchSavedAreaRecipients as (data: { analysisId: string; q: string }) => Promise<unknown>
    )({
      analysisId: "550e8400-e29b-41d4-a716-446655440000",
      q: "Maria",
    });

    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining(
        "u.name LIKE ? ESCAPE '=' OR u.employee_id LIKE ? ESCAPE '=' OR u.username LIKE ? ESCAPE '='",
      ),
      [
        "550e8400-e29b-41d4-a716-446655440000",
        "%Maria%",
        "%Maria%",
        "%Maria%",
        "Maria",
        "Maria",
        "Maria%",
        "Maria%",
        "Maria%",
      ],
    );
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining("u.password IS NOT NULL"),
      expect.any(Array),
    );
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining("u.id <> a.owner_user_id"),
      expect.any(Array),
    );
    expect(db.query).toHaveBeenCalledWith(expect.stringContaining("LIMIT 20"), expect.any(Array));
    expect(assertAdmin).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "admin-u1", userUsername: "admin" }),
    );
    expect(result).toEqual([
      {
        id: "recipient-1",
        username: "maria.silva",
        employeeId: "001234",
        name: "Maria Silva",
      },
    ]);
  });

  it("escapes LIKE wildcards from recipient searches", async () => {
    vi.mocked(db.query).mockResolvedValueOnce([[]] as never);

    await (
      searchSavedAreaRecipients as (data: { analysisId: string; q: string }) => Promise<unknown>
    )({
      analysisId: "550e8400-e29b-41d4-a716-446655440000",
      q: "a%_=",
    });

    expect(db.query).toHaveBeenCalledWith(
      expect.any(String),
      expect.arrayContaining(["%a=%=_==%", "a=%=_==%"]),
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

describe("updateAdminUser", () => {
  type UpdateInput = {
    userId: string;
    username?: string;
    employeeId?: string;
    name: string;
    role: string;
    isActive: boolean;
  };
  const input: UpdateInput = {
    userId: "u-target",
    username: "novo.nome",
    employeeId: "9999",
    name: "Novo Nome",
    role: "admin",
    isActive: false,
  };

  it("updates all editable user fields in one operation", async () => {
    const result = await (updateAdminUser as (d: typeof input) => Promise<{ ok: boolean }>)(input);
    expect(result.ok).toBe(true);
    expect(db.query).toHaveBeenCalledWith(
      "UPDATE users SET username = ?, employee_id = ?, name = ?, role = ?, is_active = ? WHERE id = ?",
      ["novo.nome", "9999", "Novo Nome", "admin", false, "u-target"],
    );
    expect(invalidateAdminCache).toHaveBeenCalledWith("u-target");
    expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "user.update" }));
  });

  it("stores a missing optional identifier as NULL", async () => {
    await (updateAdminUser as (d: typeof input) => Promise<unknown>)({
      ...input,
      username: undefined,
    });
    expect(db.query).toHaveBeenCalledWith(expect.any(String), [
      null,
      "9999",
      "Novo Nome",
      "admin",
      false,
      "u-target",
    ]);
  });

  it("translates a uniqueness conflict (ER_DUP_ENTRY) into a friendly message", async () => {
    const dupError = Object.assign(new Error("Duplicate entry"), { code: "ER_DUP_ENTRY" });
    vi.mocked(db.query).mockRejectedValueOnce(dupError);
    await expect(
      (updateAdminUser as (d: typeof input) => Promise<unknown>)({
        ...input,
        username: "ja.existe",
        employeeId: "1",
      }),
    ).rejects.toThrow("Username ou matrícula já usados por outra conta.");
  });

  it("blocks self-deactivation before recording any audit entry", async () => {
    await expect(
      (updateAdminUser as (d: typeof input) => Promise<unknown>)({
        ...input,
        userId: "admin-u1",
        role: "admin",
        isActive: false,
      }),
    ).rejects.toThrow("não pode inativar sua própria conta");
    expect(db.query).not.toHaveBeenCalled();
    expect(recordAudit).not.toHaveBeenCalled();
  });

  it("blocks self-demotion before updating or invalidating the cache", async () => {
    await expect(
      (updateAdminUser as (d: typeof input) => Promise<unknown>)({
        ...input,
        userId: "admin-u1",
        role: "user",
        isActive: true,
      }),
    ).rejects.toThrow("não pode remover seu próprio acesso");
    expect(db.query).not.toHaveBeenCalled();
    expect(invalidateAdminCache).not.toHaveBeenCalled();
  });
});
