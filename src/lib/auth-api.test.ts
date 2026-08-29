import { describe, it, expect, vi, beforeEach } from "vitest";

vi.hoisted(() => {
  process.env.JWT_SECRET = "test-secret";
});

type Middleware = (opts: {
  next: (ctx: unknown) => unknown;
  context: unknown;
  data: unknown;
}) => unknown;
type Handler = (opts: { data?: unknown; context: unknown }) => unknown;

// inputValidator becomes a passthrough: the real Zod parser passed to
// `.inputValidator(...)` is never called. That includes the schema's
// `.default(...)`: whoever calls `login(...)`/`setInitialPassword(...)`
// in the tests needs to pass the already "post-parse" value explicitly
// (e.g. `rememberMe: false`), because the field's absence here doesn't get
// the default it would get in production.
//
// Supports `.middleware([...])` (used only by `changePassword`) alongside
// the other functions in this file's direct
// `.inputValidator()/.handler()` path, which don't go through any middleware.
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
            let ctx = {};
            for (const m of chain.middlewares) {
              const r = (await m({ next: (c: unknown) => c, context: ctx, data: input })) as
                { context?: unknown } | undefined;
              if (r?.context) ctx = r.context;
            }
            return fn({ data: input, context: ctx });
          },
        }),
        handler: (fn: Handler) => async (input?: unknown) => {
          let ctx = {};
          for (const m of chain.middlewares) {
            const r = (await m({
              next: (c: unknown) => c,
              context: ctx,
              data: input,
            })) as { context?: unknown } | undefined;
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

vi.mock("@tanstack/react-start/server", () => ({
  getRequest: vi.fn(() => ({ headers: new Map([["cookie", "session=valid-jwt"]]) })),
  getCookie: vi.fn(() => "valid-jwt"),
  setCookie: vi.fn(),
  deleteCookie: vi.fn(),
  setResponseStatus: vi.fn(),
  setResponseHeader: vi.fn(),
}));

vi.mock("./db", () => ({ default: { query: vi.fn() } }));
vi.mock("bcrypt", () => ({ default: { compare: vi.fn(), hash: vi.fn() } }));
vi.mock("jsonwebtoken", () => ({ default: { sign: vi.fn(), verify: vi.fn() } }));
vi.mock("./turnstile", () => ({ verifyTurnstile: vi.fn(), isTurnstileEnabled: vi.fn() }));
vi.mock("./rate-limit", () => ({
  authLimiter: { check: vi.fn() },
  authAccountLimiter: { check: vi.fn(), reset: vi.fn() },
  getClientIp: vi.fn(() => "127.0.0.1"),
}));
vi.mock("./rate-limit.middleware", () => ({
  requireRateLimit: vi.fn(
    () =>
      ({ next, context }: { next: (ctx: unknown) => unknown; context: unknown }) =>
        next({ context }),
  ),
}));
// The real requireAuthAllowExpiredPassword (auth-middleware.ts) pulls in
// createMiddleware; mocked directly so we don't have to mock that too --
// changePassword in the tests receives whatever context this mock injects.
vi.mock("./auth-middleware", () => ({
  requireAuthAllowExpiredPassword: vi.fn(
    ({ next, context }: { next: (ctx: unknown) => unknown; context: unknown }) =>
      next({
        context: {
          ...(context as object),
          userId: "u1",
          userRole: "admin",
          userUsername: "test",
          persistent: false,
        },
      }),
  ),
}));

import { login, getMe, logout, setInitialPassword, changePassword } from "./auth-api";
import { isExpectedError } from "./sentry-error-metadata";
import {
  deleteCookie,
  getCookie,
  setCookie,
  setResponseHeader,
  setResponseStatus,
} from "@tanstack/react-start/server";
import db from "./db";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { verifyTurnstile, isTurnstileEnabled } from "./turnstile";
import { authLimiter, authAccountLimiter } from "./rate-limit";

// password_change_required: 0 by default -- the login/getMe/logout tests
// aren't about password expiration (that's covered in its own describe block).
const dbRow = (overrides: Record<string, unknown> = {}) => [
  {
    id: "u1",
    username: "test",
    employee_id: null,
    name: "Teste",
    password: "$2b$12$hash",
    role: "admin",
    is_active: true,
    token_version: 0,
    password_change_required: 0,
    ...overrides,
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(authLimiter.check).mockReturnValue({
    allowed: true,
    remaining: 4,
    resetAt: Date.now() + 60000,
  });
  vi.mocked(authAccountLimiter.check).mockReturnValue({
    allowed: true,
    remaining: 4,
    resetAt: Date.now() + 60000,
  });
  vi.mocked(verifyTurnstile).mockResolvedValue(true);
  vi.mocked(isTurnstileEnabled).mockReturnValue(false);
  vi.mocked(bcrypt.compare).mockResolvedValue(true as never);
  vi.mocked(bcrypt.hash).mockResolvedValue("$2b$12$newhash" as never);
  vi.mocked(jwt.sign).mockReturnValue("jwt-token" as never);
  vi.mocked(jwt.verify).mockReturnValue({ userId: "u1", role: "admin" } as never);
  vi.mocked(getCookie).mockReturnValue("valid-jwt");
  vi.mocked(db.query).mockResolvedValue([dbRow()] as never);
});

describe("login", () => {
  it("sets an httpOnly session cookie and returns ok, never exposing the token to the caller", async () => {
    // rememberMe: false explicit because this createServerFn mock never
    // invokes the real Zod parser (see the comment at the top of the
    // file); in production the schema's default would cover the field's absence.
    const result = await login({
      identifier: "test",
      password: "correct",
      rememberMe: false,
    } as never);
    expect(result).toEqual({ ok: true });
    expect(bcrypt.compare).toHaveBeenCalledWith("correct", "$2b$12$hash");
    // tokenVersion goes in the payload so resetPassword/changePassword/logout
    // can invalidate this session later. Without "remember me", the session
    // is born "normal" (not persistent, expires after 1h of inactivity), see
    // src/lib/auth-config.ts. No email in the payload (session.ts re-reads
    // username/employee_id from the database on every request).
    expect(jwt.sign).toHaveBeenCalledWith(
      {
        userId: "u1",
        role: "admin",
        tokenVersion: 0,
        loginAt: expect.any(Number),
        persistent: false,
      },
      expect.any(String),
      { expiresIn: 3600 },
    );
    expect(setCookie).toHaveBeenCalledWith(
      "session",
      "jwt-token",
      expect.objectContaining({ httpOnly: true, path: "/", sameSite: "lax", maxAge: 3600 }),
    );
    expect(authAccountLimiter.reset).toHaveBeenCalledWith("user:u1");
  });

  it("with rememberMe, issues a 7-day persistent session", async () => {
    const result = await login({
      identifier: "test",
      password: "correct",
      rememberMe: true,
    } as never);
    expect(result).toEqual({ ok: true });
    expect(jwt.sign).toHaveBeenCalledWith(
      expect.objectContaining({ persistent: true }),
      expect.any(String),
      { expiresIn: 7 * 24 * 60 * 60 },
    );
    expect(setCookie).toHaveBeenCalledWith(
      "session",
      "jwt-token",
      expect.objectContaining({ maxAge: 7 * 24 * 60 * 60 }),
    );
  });

  it("authenticates by employee_id (not just username)", async () => {
    vi.mocked(db.query).mockResolvedValue([
      dbRow({ username: "test", employee_id: "5001" }),
    ] as never);
    const result = await login({
      identifier: "5001",
      password: "correct",
      rememberMe: false,
    } as never);
    expect(result).toEqual({ ok: true });
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining("WHERE username = ? OR employee_id = ?"),
      ["5001", "5001"],
    );
  });

  it("throws on wrong password", async () => {
    vi.mocked(bcrypt.compare).mockResolvedValue(false as never);
    await expect(login({ identifier: "test", password: "wrong" } as never)).rejects.toThrow(
      "Usuário/matrícula ou senha inválidos",
    );
    expect(setCookie).not.toHaveBeenCalled();
    expect(authAccountLimiter.reset).not.toHaveBeenCalled();
  });

  it("throws when user is inactive", async () => {
    vi.mocked(db.query).mockResolvedValue([dbRow({ is_active: false })] as never);
    await expect(login({ identifier: "test", password: "correct" } as never)).rejects.toThrow(
      "Usuário inativo",
    );
  });

  it("throws when identifier not found", async () => {
    vi.mocked(db.query).mockResolvedValue([[]] as never);
    await expect(login({ identifier: "unknown", password: "x" } as never)).rejects.toThrow(
      "Usuário/matrícula ou senha inválidos",
    );
  });

  it("account without a password (first access pending): never calls bcrypt.compare, specific message", async () => {
    vi.mocked(db.query).mockResolvedValue([dbRow({ password: null })] as never);
    await expect(login({ identifier: "test", password: "qualquer" } as never)).rejects.toThrow(
      "primeiro acesso",
    );
    expect(bcrypt.compare).not.toHaveBeenCalled();
  });

  it("throws when rate limit exceeded", async () => {
    vi.mocked(authLimiter.check).mockReturnValue({
      allowed: false,
      remaining: 0,
      resetAt: Date.now() + 60000,
    });
    await expect(login({ identifier: "test", password: "x" } as never)).rejects.toThrow(
      "Muitas tentativas",
    );
    expect(setResponseStatus).toHaveBeenCalledWith(429);
    expect(setResponseHeader).toHaveBeenCalledWith("Retry-After", "60");
  });

  it("throws when account-level rate limit exceeded (per account, not per IP)", async () => {
    vi.mocked(authAccountLimiter.check).mockReturnValue({
      allowed: false,
      remaining: 0,
      resetAt: Date.now() + 900000,
    });
    await expect(login({ identifier: "test", password: "x" } as never)).rejects.toThrow(
      "Muitas tentativas de login para esta conta",
    );
  });

  // The account bucket's key is the resolved id, not the typed string:
  // switching between username and employee_id of the SAME account must
  // not reset the bucket.
  it("keys the account rate limit by the resolved id", async () => {
    await login({ identifier: "test", password: "correct" } as never);
    expect(authAccountLimiter.check).toHaveBeenCalledWith("user:u1");
  });

  it("keys by the raw identifier when the account isn't found", async () => {
    vi.mocked(db.query).mockResolvedValue([[]] as never);
    await login({ identifier: "ninguem", password: "x" } as never).catch(() => {});
    expect(authAccountLimiter.check).toHaveBeenCalledWith("identifier:ninguem");
  });

  it("throws when Turnstile verification fails", async () => {
    vi.mocked(verifyTurnstile).mockResolvedValue(false);
    await expect(
      login({ identifier: "test", password: "x", turnstileToken: "bad-token" } as never),
    ).rejects.toThrow("Falha na verificação");
    expect(db.query).not.toHaveBeenCalledWith(
      expect.stringContaining("SELECT id, username"),
      expect.anything(),
    );
    expect(authAccountLimiter.check).not.toHaveBeenCalled();
  });

  it("fail-closed: refuses login without a token when Turnstile is active", async () => {
    vi.mocked(isTurnstileEnabled).mockReturnValue(true);
    await expect(login({ identifier: "test", password: "correct" } as never)).rejects.toThrow(
      "Falha na verificação",
    );
    expect(bcrypt.compare).not.toHaveBeenCalled();
    expect(setCookie).not.toHaveBeenCalled();
    expect(db.query).not.toHaveBeenCalledWith(
      expect.stringContaining("SELECT id, username"),
      expect.anything(),
    );
    expect(authAccountLimiter.check).not.toHaveBeenCalled();
  });
});

describe("getMe", () => {
  it("returns user when session cookie is valid", async () => {
    const user = await getMe();
    expect(user).toEqual({
      id: "u1",
      username: "test",
      employeeId: null,
      name: "Teste",
      role: "admin",
      passwordChangeRequired: false,
    });
  });

  // getMe runs on every navigation (cached for 60s in the route guard), it
  // can't have the side effect of reissuing the session on every call.
  // Sliding the session on activity is requireAuth's job, called by the
  // functions that actually fetch data (see auth-middleware.test.ts).
  it("does not reissue the cookie (does not slide the session)", async () => {
    await getMe();
    expect(jwt.sign).not.toHaveBeenCalled();
    expect(setCookie).not.toHaveBeenCalled();
  });

  it("returns null when there is no session cookie", async () => {
    vi.mocked(getCookie).mockReturnValue(undefined);
    const user = await getMe();
    expect(user).toBeNull();
  });

  it("returns null when user is inactive", async () => {
    vi.mocked(db.query).mockResolvedValue([dbRow({ is_active: false })] as never);
    const user = await getMe();
    expect(user).toBeNull();
  });

  it("returns null when the password was reset after the token was issued", async () => {
    vi.mocked(jwt.verify).mockReturnValue({
      userId: "u1",
      role: "admin",
      tokenVersion: 0,
    } as never);
    vi.mocked(db.query).mockResolvedValue([dbRow({ token_version: 1 })] as never);
    const user = await getMe();
    expect(user).toBeNull();
  });

  it("passwordChangeRequired: true when the password is pending/expired", async () => {
    vi.mocked(db.query).mockResolvedValue([dbRow({ password_change_required: 1 })] as never);
    const user = await getMe();
    expect(user).not.toBeNull();
    expect(user?.passwordChangeRequired).toBe(true);
  });
});

describe("logout", () => {
  it("clears the session cookie server-side and returns ok", async () => {
    const result = await logout();
    expect(result).toEqual({ ok: true });
    expect(deleteCookie).toHaveBeenCalledWith("session", { path: "/" });
  });

  it("revokes the server-side token by incrementing token_version", async () => {
    await logout();
    expect(db.query).toHaveBeenCalledWith(
      "UPDATE users SET token_version = token_version + 1 WHERE id = ?",
      ["u1"],
    );
  });

  it("does not try to revoke or audit when there is no session cookie", async () => {
    vi.mocked(getCookie).mockReturnValue(undefined);
    const result = await logout();
    expect(result).toEqual({ ok: true });
    expect(db.query).not.toHaveBeenCalled();
  });

  it("does not break if the cookie's token is invalid/expired", async () => {
    vi.mocked(jwt.verify).mockImplementation(() => {
      throw new Error("jwt expired");
    });
    const result = await logout();
    expect(result).toEqual({ ok: true });
    expect(db.query).not.toHaveBeenCalled();
    expect(deleteCookie).toHaveBeenCalledWith("session", { path: "/" });
  });
});

describe("setInitialPassword", () => {
  it("correct identifier (username OR employee_id): sets the password and auto-logs in (issueSession)", async () => {
    vi.mocked(db.query).mockResolvedValue([
      [{ id: "u1", username: "novo", role: "user", password: null, token_version: 0 }],
    ] as never);
    const result = await setInitialPassword({
      identifier: "novo",
      newPassword: "Str0ng!Pass",
      confirmPassword: "Str0ng!Pass",
    } as never);
    expect(result).toEqual({ ok: true });
    expect(db.query).toHaveBeenCalledWith(
      "SELECT id, username, role, password, token_version FROM users WHERE username = ? OR employee_id = ?",
      ["novo", "novo"],
    );
    expect(bcrypt.hash).toHaveBeenCalledWith("Str0ng!Pass", 12);
    expect(db.query).toHaveBeenCalledWith(
      "UPDATE users SET password = ?, password_changed_at = NOW() WHERE id = ?",
      ["$2b$12$newhash", "u1"],
    );
    expect(setCookie).toHaveBeenCalled();
    expect(authAccountLimiter.reset).toHaveBeenCalledWith("user:u1");
  });

  it("also resolves by employee_id, same resolution as login", async () => {
    vi.mocked(db.query).mockResolvedValue([
      [{ id: "u1", username: null, role: "user", password: null, token_version: 0 }],
    ] as never);
    const result = await setInitialPassword({
      identifier: "5001",
      newPassword: "Str0ng!Pass",
      confirmPassword: "Str0ng!Pass",
    } as never);
    expect(result).toEqual({ ok: true });
    expect(setCookie).toHaveBeenCalled();
  });

  it("rejects when the account already has a password (generic message, doesn't confirm existence)", async () => {
    vi.mocked(db.query).mockResolvedValue([
      [
        {
          id: "u1",
          username: "novo",
          role: "user",
          password: "$2b$12$jatemsenha",
          token_version: 0,
        },
      ],
    ] as never);
    await expect(
      setInitialPassword({
        identifier: "novo",
        newPassword: "Str0ng!Pass",
        confirmPassword: "Str0ng!Pass",
      } as never),
    ).rejects.toThrow("Usuário ou matrícula inválidos");
    expect(setCookie).not.toHaveBeenCalled();
  });

  it("rejects when the identifier doesn't match any account", async () => {
    vi.mocked(db.query).mockResolvedValue([[]] as never);
    await expect(
      setInitialPassword({
        identifier: "inexistente",
        newPassword: "Str0ng!Pass",
        confirmPassword: "Str0ng!Pass",
      } as never),
    ).rejects.toSatisfy(
      (error: unknown) =>
        error instanceof Error &&
        error.message.includes("Usuário ou matrícula inválidos") &&
        isExpectedError(error),
    );
  });

  it("protected by IP rate limit, same as login", async () => {
    vi.mocked(authLimiter.check).mockReturnValue({
      allowed: false,
      remaining: 0,
      resetAt: Date.now() + 60000,
    });
    await expect(
      setInitialPassword({
        identifier: "novo",
        newPassword: "Str0ng!Pass",
        confirmPassword: "Str0ng!Pass",
      } as never),
    ).rejects.toThrow("Muitas tentativas");
  });

  it("validates Turnstile before querying or consuming the account bucket", async () => {
    vi.mocked(isTurnstileEnabled).mockReturnValue(true);
    vi.mocked(verifyTurnstile).mockResolvedValue(false);

    await expect(
      setInitialPassword({
        identifier: "novo",
        newPassword: "Str0ng!Pass",
        confirmPassword: "Str0ng!Pass",
        turnstileToken: "bad-token",
      } as never),
    ).rejects.toThrow("Falha na verificação");
    expect(db.query).not.toHaveBeenCalled();
    expect(authAccountLimiter.check).not.toHaveBeenCalled();
  });
});

describe("changePassword", () => {
  it("checks the current password, writes the new one, and reissues the session with a fresh token_version", async () => {
    vi.mocked(db.query)
      .mockResolvedValueOnce([[{ password: "$2b$12$hash" }]] as never) // SELECT password
      .mockResolvedValueOnce([{ affectedRows: 1 }] as never) // UPDATE
      .mockResolvedValueOnce([[{ token_version: 7 }]] as never); // SELECT fresh token_version

    const result = await changePassword({
      currentPassword: "atual",
      newPassword: "N0v@Senha!",
      confirmPassword: "N0v@Senha!",
    } as never);

    expect(result).toEqual({ ok: true });
    expect(bcrypt.compare).toHaveBeenCalledWith("atual", "$2b$12$hash");
    expect(bcrypt.hash).toHaveBeenCalledWith("N0v@Senha!", 12);
    // Proves it reissues with the value from the SECOND query (post-update),
    // not a stale value from before: without this, the very tab that changes
    // the password would self-destruct on the next call (token_version
    // would come back wrong).
    expect(jwt.sign).toHaveBeenCalledWith(
      expect.objectContaining({ tokenVersion: 7 }),
      expect.any(String),
      expect.any(Object),
    );
    expect(setCookie).toHaveBeenCalled();
  });

  it("rejects when the current password is wrong", async () => {
    vi.mocked(db.query).mockResolvedValueOnce([[{ password: "$2b$12$hash" }]] as never);
    vi.mocked(bcrypt.compare).mockResolvedValue(false as never);
    await expect(
      changePassword({
        currentPassword: "errada",
        newPassword: "N0v@Senha!",
        confirmPassword: "N0v@Senha!",
      } as never),
    ).rejects.toThrow("Senha atual incorreta");
    expect(setCookie).not.toHaveBeenCalled();
  });
});
