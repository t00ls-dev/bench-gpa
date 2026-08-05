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

// inputValidator vira um passthrough: o parser Zod real passado a
// `.inputValidator(...)` nunca é chamado. Isso inclui os `.default(...)`
// do schema: quem chama `login(...)`/`setInitialPassword(...)` nos testes
// precisa passar o valor já "pós-parse" explicitamente (ex.: `rememberMe:
// false`), porque a ausência do campo aqui não recebe o default que
// receberia em produção.
//
// Suporta `.middleware([...])` (usado só por `changePassword`) além do
// caminho direto `.inputValidator()/.handler()` das demais funções deste
// arquivo, que não passam por middleware nenhum.
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
}));

vi.mock("./db", () => ({ default: { query: vi.fn() } }));
vi.mock("bcrypt", () => ({ default: { compare: vi.fn(), hash: vi.fn() } }));
vi.mock("jsonwebtoken", () => ({ default: { sign: vi.fn(), verify: vi.fn() } }));
vi.mock("./turnstile", () => ({ verifyTurnstile: vi.fn(), isTurnstileEnabled: vi.fn() }));
vi.mock("./rate-limit", () => ({
  authLimiter: { check: vi.fn() },
  authAccountLimiter: { check: vi.fn() },
  getClientIp: vi.fn(() => "127.0.0.1"),
}));
vi.mock("./rate-limit.middleware", () => ({
  requireRateLimit: vi.fn(
    () =>
      ({ next, context }: { next: (ctx: unknown) => unknown; context: unknown }) =>
        next({ context }),
  ),
}));
// requireAuthAllowExpiredPassword real (auth-middleware.ts) puxa
// createMiddleware; mockado direto pra não precisar mockar isso também --
// changePassword nos testes recebe o contexto que este mock injetar.
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
import { getCookie, setCookie, deleteCookie } from "@tanstack/react-start/server";
import db from "./db";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { verifyTurnstile, isTurnstileEnabled } from "./turnstile";
import { authLimiter, authAccountLimiter } from "./rate-limit";

// password_change_required: 0 no default -- os testes de login/getMe/logout
// não são sobre expiração de senha (isso é coberto na sua própria describe).
const dbRow = (overrides: Record<string, unknown> = {}) => [
  {
    id: "u1",
    username: "test",
    matricula: null,
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
    // rememberMe: false explícito porque este mock de createServerFn nunca
    // invoca o parser Zod real (ver comentário no topo do arquivo), em
    // produção o default do schema cobriria a ausência do campo.
    const result = await login({
      identifier: "test",
      password: "correct",
      rememberMe: false,
    } as never);
    expect(result).toEqual({ ok: true });
    expect(bcrypt.compare).toHaveBeenCalledWith("correct", "$2b$12$hash");
    // tokenVersion vai no payload para que resetPassword/changePassword/logout
    // consigam invalidar esta sessão depois. Sem "manter conectado", a sessão
    // nasce como "normal" (não persistente, expira em 1h de inatividade), ver
    // src/lib/auth-config.ts. Sem email no payload (session.ts relê
    // username/matrícula do banco a cada request).
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
  });

  it("com rememberMe, emite uma sessão persistente de 7 dias", async () => {
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

  it("autentica por matrícula (não só por username)", async () => {
    vi.mocked(db.query).mockResolvedValue([
      dbRow({ username: "test", matricula: "5001" }),
    ] as never);
    const result = await login({
      identifier: "5001",
      password: "correct",
      rememberMe: false,
    } as never);
    expect(result).toEqual({ ok: true });
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining("WHERE username = ? OR matricula = ?"),
      ["5001", "5001"],
    );
  });

  it("throws on wrong password", async () => {
    vi.mocked(bcrypt.compare).mockResolvedValue(false as never);
    await expect(login({ identifier: "test", password: "wrong" } as never)).rejects.toThrow(
      "Usuário/matrícula ou senha inválidos",
    );
    expect(setCookie).not.toHaveBeenCalled();
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

  it("conta sem senha (primeiro acesso pendente): nunca chama bcrypt.compare, mensagem específica", async () => {
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
  });

  it("throws when account-level rate limit exceeded (por conta, não por IP)", async () => {
    vi.mocked(authAccountLimiter.check).mockReturnValue({
      allowed: false,
      remaining: 0,
      resetAt: Date.now() + 900000,
    });
    await expect(login({ identifier: "test", password: "x" } as never)).rejects.toThrow(
      "Muitas tentativas de login para esta conta",
    );
  });

  // Chave do balde de conta é o id resolvido, não a string digitada: alternar
  // entre username e matrícula da MESMA conta não pode resetar o balde.
  it("chaveia o rate limit de conta pelo id resolvido", async () => {
    await login({ identifier: "test", password: "correct" } as never);
    expect(authAccountLimiter.check).toHaveBeenCalledWith("user:u1");
  });

  it("chaveia pelo identificador bruto quando a conta não é encontrada", async () => {
    vi.mocked(db.query).mockResolvedValue([[]] as never);
    await login({ identifier: "ninguem", password: "x" } as never).catch(() => {});
    expect(authAccountLimiter.check).toHaveBeenCalledWith("identifier:ninguem");
  });

  it("throws when Turnstile verification fails", async () => {
    vi.mocked(verifyTurnstile).mockResolvedValue(false);
    await expect(
      login({ identifier: "test", password: "x", turnstileToken: "bad-token" } as never),
    ).rejects.toThrow("Falha na verificação");
  });

  it("fail-closed: recusa login sem token quando o Turnstile está ativo", async () => {
    vi.mocked(isTurnstileEnabled).mockReturnValue(true);
    await expect(login({ identifier: "test", password: "correct" } as never)).rejects.toThrow(
      "Falha na verificação",
    );
    expect(bcrypt.compare).not.toHaveBeenCalled();
    expect(setCookie).not.toHaveBeenCalled();
  });
});

describe("getMe", () => {
  it("returns user when session cookie is valid", async () => {
    const user = await getMe();
    expect(user).toEqual({
      id: "u1",
      username: "test",
      matricula: null,
      name: "Teste",
      role: "admin",
      passwordChangeRequired: false,
    });
  });

  // getMe roda a cada navegação (cacheado 60s no guard de rotas), não pode
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
    vi.mocked(db.query).mockResolvedValue([dbRow({ is_active: false })] as never);
    const user = await getMe();
    expect(user).toBeNull();
  });

  it("returns null quando a senha foi redefinida depois da emissão do token", async () => {
    vi.mocked(jwt.verify).mockReturnValue({
      userId: "u1",
      role: "admin",
      tokenVersion: 0,
    } as never);
    vi.mocked(db.query).mockResolvedValue([dbRow({ token_version: 1 })] as never);
    const user = await getMe();
    expect(user).toBeNull();
  });

  it("passwordChangeRequired: true quando a senha está pendente/expirada", async () => {
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

describe("setInitialPassword", () => {
  it("identificador (username OU matrícula) correto: define a senha e auto-loga (issueSession)", async () => {
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
      "SELECT id, username, role, password, token_version FROM users WHERE username = ? OR matricula = ?",
      ["novo", "novo"],
    );
    expect(bcrypt.hash).toHaveBeenCalledWith("Str0ng!Pass", 12);
    expect(db.query).toHaveBeenCalledWith(
      "UPDATE users SET password = ?, password_changed_at = NOW() WHERE id = ?",
      ["$2b$12$newhash", "u1"],
    );
    expect(setCookie).toHaveBeenCalled();
  });

  it("também resolve pela matrícula, mesma resolução do login", async () => {
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

  it("rejeita quando a conta já tem senha (mensagem genérica, não confirma existência)", async () => {
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

  it("rejeita quando o identificador não corresponde a nenhuma conta", async () => {
    vi.mocked(db.query).mockResolvedValue([[]] as never);
    await expect(
      setInitialPassword({
        identifier: "inexistente",
        newPassword: "Str0ng!Pass",
        confirmPassword: "Str0ng!Pass",
      } as never),
    ).rejects.toThrow("Usuário ou matrícula inválidos");
  });

  it("protegido por rate limit de IP, igual ao login", async () => {
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
});

describe("changePassword", () => {
  it("confere a senha atual, grava a nova e reemite a sessão com o token_version fresco", async () => {
    vi.mocked(db.query)
      .mockResolvedValueOnce([[{ password: "$2b$12$hash" }]] as never) // SELECT password
      .mockResolvedValueOnce([{ affectedRows: 1 }] as never) // UPDATE
      .mockResolvedValueOnce([[{ token_version: 7 }]] as never); // SELECT token_version fresco

    const result = await changePassword({
      currentPassword: "atual",
      newPassword: "N0v@Senha!",
      confirmPassword: "N0v@Senha!",
    } as never);

    expect(result).toEqual({ ok: true });
    expect(bcrypt.compare).toHaveBeenCalledWith("atual", "$2b$12$hash");
    expect(bcrypt.hash).toHaveBeenCalledWith("N0v@Senha!", 12);
    // Prova que reemite com o valor da SEGUNDA consulta (pós-update), não um
    // valor congelado de antes: sem isso, a própria aba que troca a senha se
    // autodestruiria na chamada seguinte (token_version bateria errado).
    expect(jwt.sign).toHaveBeenCalledWith(
      expect.objectContaining({ tokenVersion: 7 }),
      expect.any(String),
      expect.any(Object),
    );
    expect(setCookie).toHaveBeenCalled();
  });

  it("rejeita quando a senha atual está errada", async () => {
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
