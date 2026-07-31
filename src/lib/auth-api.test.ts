import { describe, it, expect, vi, beforeEach } from "vitest";

vi.hoisted(() => {
  process.env.JWT_SECRET = "test-secret";
});

type Handler = (opts: { data?: unknown; context: unknown }) => unknown;

// inputValidator vira um passthrough — o parser Zod real passado a
// `.inputValidator(...)` nunca é chamado. Isso inclui os `.default(...)`
// do schema: quem chama `login(...)` nos testes precisa passar o valor já
// "pós-parse" explicitamente (ex.: `rememberMe: false`), porque a ausência do
// campo aqui não recebe o default que receberia em produção.
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
vi.mock("./turnstile", () => ({ verifyTurnstile: vi.fn(), isTurnstileEnabled: vi.fn() }));
vi.mock("./rate-limit", () => ({
  authLimiter: { check: vi.fn() },
  getClientIp: vi.fn(() => "127.0.0.1"),
}));

import { login, getMe, logout } from "./auth-api";
import { getCookie, setCookie, deleteCookie } from "@tanstack/react-start/server";
import db from "./db";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { verifyTurnstile, isTurnstileEnabled } from "./turnstile";
import { authLimiter } from "./rate-limit";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(authLimiter.check).mockReturnValue({
    allowed: true,
    remaining: 4,
    resetAt: Date.now() + 60000,
  });
  vi.mocked(verifyTurnstile).mockResolvedValue(true);
  vi.mocked(isTurnstileEnabled).mockReturnValue(false);
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
        token_version: 0,
      },
    ],
  ] as never);
});

describe("login", () => {
  it("sets an httpOnly session cookie and returns ok, never exposing the token to the caller", async () => {
    // rememberMe: false explícito porque este mock de createServerFn nunca
    // invoca o parser Zod real (ver comentário no topo do arquivo) — em
    // produção o default do schema cobriria a ausência do campo.
    const result = await login({
      email: "test@gpabr.com",
      password: "correct",
      rememberMe: false,
    } as never);
    expect(result).toEqual({ ok: true });
    expect(bcrypt.compare).toHaveBeenCalledWith("correct", "$2b$12$hash");
    // tokenVersion vai no payload para que resetPassword consiga invalidar esta
    // sessão depois — ver auth-middleware.test.ts. Sem "manter conectado", a
    // sessão nasce como "normal" (não persistente, expira em 1h de
    // inatividade) — ver src/lib/auth-config.ts.
    expect(jwt.sign).toHaveBeenCalledWith(
      {
        userId: "u1",
        role: "admin",
        email: "test@gpabr.com",
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
  });

  it("com rememberMe, emite uma sessão persistente de 7 dias", async () => {
    const result = await login({
      email: "test@gpabr.com",
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

  it("fail-closed: recusa login sem token quando o Turnstile está ativo", async () => {
    vi.mocked(isTurnstileEnabled).mockReturnValue(true);
    await expect(login({ email: "test@gpabr.com", password: "correct" } as never)).rejects.toThrow(
      "Falha na verificação",
    );
    expect(bcrypt.compare).not.toHaveBeenCalled();
    expect(setCookie).not.toHaveBeenCalled();
  });
});

describe("getMe", () => {
  it("returns user when session cookie is valid", async () => {
    const user = await getMe();
    expect(user).toEqual({ id: "u1", email: "test@gpabr.com", name: "Teste", role: "admin" });
  });

  // getMe roda a cada navegação (cacheado 60s no guard de rotas) — não pode
  // ter o efeito colateral de reemitir a sessão a cada chamada. Quem desliza
  // a sessão por atividade é o requireAuth, chamado pelas funções que de fato
  // buscam dados (ver auth-middleware.test.ts).
  it("não reemite o cookie (não desliza a sessão)", async () => {
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
    vi.mocked(db.query).mockResolvedValue([
      [{ id: "u1", email: "test@gpabr.com", name: "Teste", role: "admin", is_active: false }],
    ] as never);
    const user = await getMe();
    expect(user).toBeNull();
  });

  // O guard das rotas (_authenticated/route.tsx) decide por este retorno — se
  // ele não checasse token_version, um token anterior ao reset de senha ainda
  // entraria na aplicação mesmo com o requireAuth barrando as server functions.
  it("returns null quando a senha foi redefinida depois da emissão do token", async () => {
    vi.mocked(db.query).mockResolvedValue([
      [
        {
          id: "u1",
          email: "test@gpabr.com",
          name: "Teste",
          role: "admin",
          is_active: true,
          token_version: 1,
        },
      ],
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

  it("revoga o token no servidor incrementando token_version", async () => {
    await logout();
    expect(db.query).toHaveBeenCalledWith(
      "UPDATE users SET token_version = token_version + 1 WHERE id = ?",
      ["u1"],
    );
  });

  it("não tenta revogar nem auditar quando não há cookie de sessão", async () => {
    vi.mocked(getCookie).mockReturnValue(undefined);
    const result = await logout();
    expect(result).toEqual({ ok: true });
    expect(db.query).not.toHaveBeenCalled();
  });

  it("não quebra se o token do cookie for inválido/expirado", async () => {
    vi.mocked(jwt.verify).mockImplementation(() => {
      throw new Error("jwt expired");
    });
    const result = await logout();
    expect(result).toEqual({ ok: true });
    expect(db.query).not.toHaveBeenCalled();
    expect(deleteCookie).toHaveBeenCalledWith("session", { path: "/" });
  });
});
