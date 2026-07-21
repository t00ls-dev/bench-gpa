import { describe, it, expect, vi, beforeEach } from "vitest";

vi.hoisted(() => {
  process.env.JWT_SECRET = "test-secret";
});

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const chain: any = {};
    chain.inputValidator = () => chain;
    chain.handler = (fn: Function) => (input?: unknown) => {
      if (input !== undefined) return fn({ data: input, context: {} });
      return fn({ context: {} });
    };
    return chain;
  },
}));

vi.mock("@tanstack/react-start/server", () => ({
  getRequest: vi.fn(() => ({ headers: new Map([["cookie", "session=valid-jwt"]]) })),
}));

vi.mock("./db", () => ({ default: { query: vi.fn() } }));
vi.mock("bcrypt", () => ({ default: { compare: vi.fn() } }));
vi.mock("jsonwebtoken", () => ({ default: { sign: vi.fn(), verify: vi.fn() } }));
vi.mock("./turnstile", () => ({ verifyTurnstile: vi.fn() }));
vi.mock("./rate-limit", () => ({
  authLimiter: { check: vi.fn() },
  getClientIp: vi.fn(() => "127.0.0.1"),
}));
vi.mock("cookie", () => ({
  serialize: vi.fn(() => "session=token; HttpOnly; Path=/"),
  parse: vi.fn(() => ({ session: "valid-jwt" })),
}));

import { login, getMe, logout } from "./auth-api";
import db from "./db";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { verifyTurnstile } from "./turnstile";
import { authLimiter } from "./rate-limit";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(authLimiter.check).mockReturnValue({ allowed: true, remaining: 4, resetAt: Date.now() + 60000 });
  vi.mocked(verifyTurnstile).mockResolvedValue(true);
  vi.mocked(bcrypt.compare).mockResolvedValue(true as never);
  vi.mocked(jwt.sign).mockReturnValue("jwt-token" as never);
  vi.mocked(jwt.verify).mockReturnValue({ userId: "u1", role: "admin", email: "test@gpabr.com" } as never);
  vi.mocked(db.query).mockResolvedValue([[{ id: "u1", email: "test@gpabr.com", name: "Teste", password: "$2b$12$hash", role: "admin", is_active: true }]] as never);
});

describe("login", () => {
  it("returns JWT token with valid credentials", async () => {
    const token = await login({ email: "test@gpabr.com", password: "correct" } as never);
    expect(token).toBe("jwt-token");
    expect(bcrypt.compare).toHaveBeenCalledWith("correct", "$2b$12$hash");
    expect(jwt.sign).toHaveBeenCalledWith(
      { userId: "u1", role: "admin", email: "test@gpabr.com" },
      expect.any(String),
      { expiresIn: "7d" },
    );
  });

  it("throws on wrong password", async () => {
    vi.mocked(bcrypt.compare).mockResolvedValue(false as never);
    await expect(login({ email: "test@gpabr.com", password: "wrong" } as never)).rejects.toThrow("E-mail ou senha inválidos");
  });

  it("throws when user is inactive", async () => {
    vi.mocked(db.query).mockResolvedValue([[{ id: "u1", email: "test@gpabr.com", name: "Teste", password: "$2b$12$hash", role: "admin", is_active: false }]] as never);
    await expect(login({ email: "test@gpabr.com", password: "correct" } as never)).rejects.toThrow("Usuário inativo");
  });

  it("throws when email not found", async () => {
    vi.mocked(db.query).mockResolvedValue([[]] as never);
    await expect(login({ email: "unknown@gpabr.com", password: "x" } as never)).rejects.toThrow("E-mail ou senha inválidos");
  });

  it("throws when rate limit exceeded", async () => {
    vi.mocked(authLimiter.check).mockReturnValue({ allowed: false, remaining: 0, resetAt: Date.now() + 60000 });
    await expect(login({ email: "test@gpabr.com", password: "x" } as never)).rejects.toThrow("Muitas tentativas");
  });

  it("throws when Turnstile verification fails", async () => {
    vi.mocked(verifyTurnstile).mockResolvedValue(false);
    await expect(login({ email: "test@gpabr.com", password: "x", turnstileToken: "bad-token" } as never)).rejects.toThrow("Falha na verificação");
  });
});

describe("getMe", () => {
  it("returns user when session cookie is valid", async () => {
    const user = await getMe();
    expect(user).toEqual({ id: "u1", email: "test@gpabr.com", name: "Teste", role: "admin" });
  });

  it("returns null when user is inactive", async () => {
    vi.mocked(db.query).mockResolvedValue([[{ id: "u1", email: "test@gpabr.com", name: "Teste", role: "admin", is_active: false }]] as never);
    const user = await getMe();
    expect(user).toBeNull();
  });
});

describe("logout", () => {
  it("returns ok and clears cookie", async () => {
    const result = await logout();
    expect(result).toEqual({ ok: true, cookie: expect.stringContaining("session=") });
  });
});
