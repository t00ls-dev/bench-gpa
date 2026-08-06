import { describe, it, expect, vi, beforeEach } from "vitest";

process.env.JWT_SECRET = "test-secret";

vi.mock("@tanstack/react-start", () => ({
  createMiddleware: () => ({
    server: (fn: (opts: { next: (ctx: unknown) => unknown }) => unknown) => fn,
  }),
}));

vi.mock("@tanstack/react-start/server", () => ({
  getRequest: vi.fn(() => ({
    headers: new Map([["cookie", "session=valid-jwt"]]),
  })),
  setCookie: vi.fn(),
}));

vi.mock("./db", () => ({ default: { query: vi.fn() } }));
vi.mock("jsonwebtoken", () => ({
  default: { verify: vi.fn(), sign: vi.fn(() => "reissued-jwt") },
}));
vi.mock("cookie", () => ({
  parseCookie: vi.fn(() => ({ session: "valid-jwt" })),
}));

import { requireAuth, requireAuthAllowExpiredPassword, isSentryReported } from "./auth-middleware";
import db from "./db";
import jwt from "jsonwebtoken";
import { setCookie } from "@tanstack/react-start/server";
import { SESSION_ABSOLUTE_CAP_SECONDS } from "./auth-config";

// password_change_required: 0 by default: most tests here only want to
// validate the rest of the flow (revocation, sliding, role from the
// database), not the password gate (covered in its own describe block below).
const dbRow = (overrides: Record<string, unknown> = {}) => [
  [
    {
      id: "u1",
      name: "Teste",
      role: "admin",
      is_active: true,
      token_version: 0,
      username: "test",
      employee_id: null,
      password_change_required: 0,
      ...overrides,
    },
  ],
];

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(jwt.verify).mockReturnValue({
    userId: "u1",
    role: "admin",
    tokenVersion: 0,
  } as never);
  vi.mocked(db.query).mockResolvedValue(dbRow() as never);
});

const call = () =>
  (requireAuth as unknown as (opts: { next: (ctx: unknown) => unknown }) => Promise<unknown>)({
    next: (ctx: unknown) => ctx,
  });

describe("requireAuth", () => {
  it("passes context with valid token and active user", async () => {
    const result = await call();
    expect(result).toMatchObject({
      context: { userId: "u1", userRole: "admin", userUsername: "test" },
    });
    expect(jwt.verify).toHaveBeenCalledWith("valid-jwt", "test-secret");
  });

  it("throws when user is inactive", async () => {
    vi.mocked(db.query).mockResolvedValue(dbRow({ is_active: false }) as never);
    await expect(call()).rejects.toThrow("Unauthorized");
  });

  it("throws when JWT is expired", async () => {
    vi.mocked(jwt.verify).mockImplementation(() => {
      throw new Error("jwt expired");
    });
    await expect(call()).rejects.toThrow("Unauthorized: invalid token");
  });

  it("throws when JWT signature is invalid", async () => {
    vi.mocked(jwt.verify).mockImplementation(() => {
      throw new Error("invalid signature");
    });
    await expect(call()).rejects.toThrow("Unauthorized: invalid token");
  });

  it("throws when user not found in DB", async () => {
    vi.mocked(db.query).mockResolvedValue([[]] as never);
    await expect(call()).rejects.toThrow("Unauthorized");
  });

  // Session revocation: resetPassword/changePassword/logout increment
  // users.token_version, and every token issued before that must stop
  // being valid on the next request.
  describe("token_version", () => {
    it("rejects a token issued before the password reset", async () => {
      vi.mocked(jwt.verify).mockReturnValue({
        userId: "u1",
        role: "admin",
        tokenVersion: 2,
      } as never);
      vi.mocked(db.query).mockResolvedValue(dbRow({ token_version: 3 }) as never);
      await expect(call()).rejects.toThrow("Unauthorized: session revoked");
    });

    it("accepts a token issued after the reset", async () => {
      vi.mocked(jwt.verify).mockReturnValue({
        userId: "u1",
        role: "admin",
        tokenVersion: 3,
      } as never);
      vi.mocked(db.query).mockResolvedValue(dbRow({ token_version: 3 }) as never);
      await expect(call()).resolves.toMatchObject({ context: { userId: "u1" } });
    });

    // Transition: tokens already in circulation when the column was
    // created don't have the field in their payload. Since the column
    // starts at 0, they stay valid until they expire, the deploy doesn't
    // log anyone out.
    it("accepts a legacy token without tokenVersion while the column is at 0", async () => {
      vi.mocked(jwt.verify).mockReturnValue({ userId: "u1", role: "admin" } as never);
      await expect(call()).resolves.toMatchObject({ context: { userId: "u1" } });
    });

    it("rejects a legacy token as soon as the password is reset once", async () => {
      vi.mocked(jwt.verify).mockReturnValue({ userId: "u1", role: "admin" } as never);
      vi.mocked(db.query).mockResolvedValue(dbRow({ token_version: 1 }) as never);
      await expect(call()).rejects.toThrow("Unauthorized: session revoked");
    });
  });

  // The role in the context must come from the database: the JWT carries
  // what was true when it was issued, and a demoted user would keep
  // "admin" in the context for up to 7 days.
  it("uses the role from the database, not the one frozen in the token", async () => {
    vi.mocked(db.query).mockResolvedValue(dbRow({ role: "user" }) as never);
    await expect(call()).resolves.toMatchObject({ context: { userRole: "user" } });
  });

  // Password state (first access pending or expired 30+ days ago):
  // computed in SQL (see session.ts), requireAuth blocks every server
  // function except changePassword (which uses requireAuthAllowExpiredPassword).
  describe("passwordChangeRequired", () => {
    it("blocks with a distinct error, not prefixed with 'Unauthorized'", async () => {
      vi.mocked(db.query).mockResolvedValue(dbRow({ password_change_required: 1 }) as never);
      await expect(call()).rejects.toThrow("PasswordChangeRequired");
    });

    it("the error is not wrapped in 'Unauthorized: invalid token' (outside resolveSession's catch)", async () => {
      vi.mocked(db.query).mockResolvedValue(dbRow({ password_change_required: 1 }) as never);
      await expect(call()).rejects.toSatisfy(
        (err: unknown) => err instanceof Error && !err.message.startsWith("Unauthorized"),
      );
    });

    it("marks the error as already reported (not a real bug, must not duplicate in Sentry)", async () => {
      vi.mocked(db.query).mockResolvedValue(dbRow({ password_change_required: 1 }) as never);
      await expect(call()).rejects.toSatisfy((err: unknown) => isSentryReported(err));
    });

    it("requireAuthAllowExpiredPassword does NOT block, even with passwordChangeRequired", async () => {
      vi.mocked(db.query).mockResolvedValue(dbRow({ password_change_required: 1 }) as never);
      const result = await (
        requireAuthAllowExpiredPassword as unknown as (opts: {
          next: (ctx: unknown) => unknown;
        }) => Promise<unknown>
      )({ next: (ctx: unknown) => ctx });
      expect(result).toMatchObject({ context: { userId: "u1" } });
    });
  });

  // Expiration by inactivity: every authenticated request renews a
  // "normal" session: without this, the session would need a fixed
  // deadline from login.
  describe("sliding session", () => {
    it("reissues the cookie on every request of a normal (non-persistent) session", async () => {
      vi.mocked(jwt.verify).mockReturnValue({
        userId: "u1",
        role: "admin",
        tokenVersion: 0,
        loginAt: Math.floor(Date.now() / 1000) - 60,
        persistent: false,
      } as never);
      await expect(call()).resolves.toMatchObject({ context: { userId: "u1" } });
      expect(jwt.sign).toHaveBeenCalledWith(
        expect.objectContaining({ userId: "u1", persistent: false }),
        "test-secret",
        expect.objectContaining({ expiresIn: expect.any(Number) }),
      );
      expect(setCookie).toHaveBeenCalledWith("session", "reissued-jwt", expect.any(Object));
    });

    it("does not reissue the cookie for a 'remember me' (persistent) session", async () => {
      vi.mocked(jwt.verify).mockReturnValue({
        userId: "u1",
        role: "admin",
        tokenVersion: 0,
        loginAt: Math.floor(Date.now() / 1000) - SESSION_ABSOLUTE_CAP_SECONDS - 1000,
        persistent: true,
      } as never);
      await expect(call()).resolves.toMatchObject({ context: { userId: "u1" } });
      expect(jwt.sign).not.toHaveBeenCalled();
      expect(setCookie).not.toHaveBeenCalled();
    });

    it("rejects a normal session past the absolute cap, even with a still-valid token", async () => {
      vi.mocked(jwt.verify).mockReturnValue({
        userId: "u1",
        role: "admin",
        tokenVersion: 0,
        loginAt: Math.floor(Date.now() / 1000) - SESSION_ABSOLUTE_CAP_SECONDS - 10,
        persistent: false,
      } as never);
      await expect(call()).rejects.toThrow("Unauthorized: session expired");
      expect(setCookie).not.toHaveBeenCalled();
    });

    // Transition: tokens issued before this change don't have `loginAt`;
    // instead of expiring everyone on deploy, treat it as a login now.
    it("treats a legacy token without loginAt as logging in now, without expiring immediately", async () => {
      vi.mocked(jwt.verify).mockReturnValue({
        userId: "u1",
        role: "admin",
        tokenVersion: 0,
      } as never);
      await expect(call()).resolves.toMatchObject({ context: { userId: "u1" } });
      expect(setCookie).toHaveBeenCalled();
    });
  });

  // sentryFunctionErrorMiddleware (src/start.ts) recaptures any error that
  // escapes here, since it sits outside requireAuth in the middleware
  // chain: without the mark, the same error becomes two events in Sentry.
  describe("marking an error as already reported to Sentry", () => {
    it("marks the invalid-session error (expired JWT)", async () => {
      vi.mocked(jwt.verify).mockImplementation(() => {
        throw new Error("jwt expired");
      });
      await expect(call()).rejects.toSatisfy((err: unknown) => isSentryReported(err));
    });

    it("marks the error rethrown from inside next()", async () => {
      const boom = new Error("boom dentro do handler");
      await expect(
        (requireAuth as unknown as (opts: { next: (ctx: unknown) => unknown }) => Promise<unknown>)(
          {
            next: () => {
              throw boom;
            },
          },
        ),
      ).rejects.toBe(boom);
      expect(isSentryReported(boom)).toBe(true);
    });
  });
});
