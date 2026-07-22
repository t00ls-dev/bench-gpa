import { describe, it, expect, vi, beforeEach } from "vitest";

vi.hoisted(() => {
  process.env.JWT_SECRET = "test-secret";
});

type Handler = (opts: { data?: unknown; context: unknown }) => unknown;

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const chain: { inputValidator?: unknown; handler?: unknown } = {};
    chain.inputValidator = () => chain;
    chain.handler = (fn: Handler) => (input?: unknown) => {
      if (input !== undefined) return fn({ data: input, context: {} });
      return fn({ context: {} });
    };
    return chain;
  },
}));

vi.mock("@tanstack/react-start/server", () => ({
  getRequest: vi.fn(() => ({ headers: new Map([["cookie", "session=valid-jwt"]]) })),
  getCookie: vi.fn(() => "valid-jwt"),
  setCookie: vi.fn(),
  deleteCookie: vi.fn(),
}));

vi.mock("./db", () => ({ default: { query: vi.fn() } }));
vi.mock("bcrypt", () => ({ default: { compare: vi.fn() } }));
vi.mock("jsonwebtoken", () => ({ default: { sign: vi.fn(), verify: vi.fn() } }));
vi.mock("./turnstile", () => ({ verifyTurnstile: vi.fn() }));
vi.mock("./rate-limit", () => ({
  authLimiter: { check: vi.fn() },
  getClientIp: vi.fn(() => "127.0.0.1"),
}));

import { login, getMe, logout } from "./auth-api";
import { getCookie, setCookie, deleteCookie } from "@tanstack/react-start/server";
import db from "./db";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { verifyTurnstile } from "./turnstile";
import { authLimiter } from "./rate-limit";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(authLimiter.check).mockReturnValue({
    allowed: true,
    remaining: 4,
    resetAt: Date.now() + 60000,
  });
  vi.mocked(verifyTurnstile).mockResolvedValue(true);
  vi.mocked(bcrypt.compare).mockResolvedValue(true as never);
  vi.mocked(jwt.sign).mockReturnValue("jwt-token" as never);
  vi.mocked(jwt.verify).mockReturnValue({
    userId: "u1",
    role: "admin",
    email: "test@gpabr.com",
  } as never);
  vi.mocked(getCookie).mockReturnValue("valid-jwt");
  vi.mocked(db.query).mockResolvedValue([
    [
      {
        id: "u1",
        email: "test@gpabr.com",
        name: "Teste",
        password: "$2b$12$hash",
        role: "admin",
        is_active: true,
      },
    ],
  ] as never);
});

describe("login", () => {
  it("sets an httpOnly session cookie and returns ok, never exposing the token to the caller", async () => {
    const result = await login({ email: "test@gpabr.com", password: "correct" } as never);
    expect(result).toEqual({ ok: true });
    expect(bcrypt.compare).toHaveBeenCalledWith("correct", "$2b$12$hash");
    expect(jwt.sign).toHaveBeenCalledWith(
      { userId: "u1", role: "admin", email: "test@gpabr.com" },
      expect.any(String),
      { expiresIn: 604800 },
    );
    expect(setCookie).toHaveBeenCalledWith(
      "session",
      "jwt-token",
      expect.objectContaining({ httpOnly: true, path: "/", sameSite: "lax" }),
    );
  });

  it("throws on wrong password", async () => {
    vi.mocked(bcrypt.compare).mockResolvedValue(false as never);
    await expect(login({ email: "test@gpabr.com", password: "wrong" } as never)).rejects.toThrow(
      "E-mail ou senha inválidos",
    );
    expect(setCookie).not.toHaveBeenCalled();
  });

  it("throws when user is inactive", async () => {
    vi.mocked(db.query).mockResolvedValue([
      [
        {
          id: "u1",
          email: "test@gpabr.com",
          name: "Teste",
          password: "$2b$12$hash",
          role: "admin",
          is_active: false,
        },
      ],
    ] as never);
    await expect(login({ email: "test@gpabr.com", password: "correct" } as never)).rejects.toThrow(
      "Usuário inativo",
    );
  });

  it("throws when email not found", async () => {
    vi.mocked(db.query).mockResolvedValue([[]] as never);
    await expect(login({ email: "unknown@gpabr.com", password: "x" } as never)).rejects.toThrow(
      "E-mail ou senha inválidos",
    );
  });

  it("throws when rate limit exceeded", async () => {
    vi.mocked(authLimiter.check).mockReturnValue({
      allowed: false,
      remaining: 0,
      resetAt: Date.now() + 60000,
    });
    await expect(login({ email: "test@gpabr.com", password: "x" } as never)).rejects.toThrow(
      "Muitas tentativas",
    );
  });

  it("throws when Turnstile verification fails", async () => {
    vi.mocked(verifyTurnstile).mockResolvedValue(false);
    await expect(
      login({ email: "test@gpabr.com", password: "x", turnstileToken: "bad-token" } as never),
    ).rejects.toThrow("Falha na verificação");
  });
});

describe("getMe", () => {
  it("returns user when session cookie is valid", async () => {
    const user = await getMe();
    expect(user).toEqual({ id: "u1", email: "test@gpabr.com", name: "Teste", role: "admin" });
  });

  it("returns null when there is no session cookie", async () => {
    vi.mocked(getCookie).mockReturnValue(undefined);
    const user = await getMe();
    expect(user).toBeNull();
  });

  it("returns null when user is inactive", async () => {
    vi.mocked(db.query).mockResolvedValue([
      [{ id: "u1", email: "test@gpabr.com", name: "Teste", role: "admin", is_active: false }],
    ] as never);
    const user = await getMe();
    expect(user).toBeNull();
  });
});

describe("logout", () => {
  it("clears the session cookie server-side and returns ok", async () => {
    const result = await logout();
    expect(result).toEqual({ ok: true });
    expect(deleteCookie).toHaveBeenCalledWith("session", { path: "/" });
  });
});
