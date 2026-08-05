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

// password_change_required: 0 no default: a maioria dos testes aqui só quer
// validar o resto do fluxo (revogação, slide, role do banco), não o gate de
// senha (coberto em sua própria describe abaixo).
const dbRow = (overrides: Record<string, unknown> = {}) => [
  [
    {
      id: "u1",
      name: "Teste",
      role: "admin",
      is_active: true,
      token_version: 0,
      username: "test",
      matricula: null,
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

  // Revogação de sessão: resetPassword/changePassword/logout incrementam
  // users.token_version, e todo token emitido antes precisa parar de valer
  // no request seguinte.
  describe("token_version", () => {
    it("rejeita token emitido antes do reset de senha", async () => {
      vi.mocked(jwt.verify).mockReturnValue({
        userId: "u1",
        role: "admin",
        tokenVersion: 2,
      } as never);
      vi.mocked(db.query).mockResolvedValue(dbRow({ token_version: 3 }) as never);
      await expect(call()).rejects.toThrow("Unauthorized: session revoked");
    });

    it("aceita token emitido depois do reset", async () => {
      vi.mocked(jwt.verify).mockReturnValue({
        userId: "u1",
        role: "admin",
        tokenVersion: 3,
      } as never);
      vi.mocked(db.query).mockResolvedValue(dbRow({ token_version: 3 }) as never);
      await expect(call()).resolves.toMatchObject({ context: { userId: "u1" } });
    });

    // Transição: os tokens já em circulação quando a coluna foi criada não têm
    // o campo no payload. Como a coluna nasce em 0, eles seguem válidos até
    // expirar, o deploy não desloga ninguém.
    it("aceita token legado sem tokenVersion enquanto a coluna estiver em 0", async () => {
      vi.mocked(jwt.verify).mockReturnValue({ userId: "u1", role: "admin" } as never);
      await expect(call()).resolves.toMatchObject({ context: { userId: "u1" } });
    });

    it("rejeita token legado assim que a senha for redefinida uma vez", async () => {
      vi.mocked(jwt.verify).mockReturnValue({ userId: "u1", role: "admin" } as never);
      vi.mocked(db.query).mockResolvedValue(dbRow({ token_version: 1 }) as never);
      await expect(call()).rejects.toThrow("Unauthorized: session revoked");
    });
  });

  // O papel no contexto tem que sair do banco: o JWT carrega o que valia na
  // emissão, e um usuário rebaixado seguiria "admin" no contexto por até 7 dias.
  it("usa o role do banco, não o congelado no token", async () => {
    vi.mocked(db.query).mockResolvedValue(dbRow({ role: "user" }) as never);
    await expect(call()).resolves.toMatchObject({ context: { userRole: "user" } });
  });

  // Estado de senha (primeiro acesso pendente ou expirada há 30+ dias):
  // calculado em SQL (ver session.ts), requireAuth bloqueia todas as server
  // functions exceto changePassword (que usa requireAuthAllowExpiredPassword).
  describe("passwordChangeRequired", () => {
    it("bloqueia com um erro distinto, não prefixado com 'Unauthorized'", async () => {
      vi.mocked(db.query).mockResolvedValue(dbRow({ password_change_required: 1 }) as never);
      await expect(call()).rejects.toThrow("PasswordChangeRequired");
    });

    it("o erro não é embrulhado em 'Unauthorized: invalid token' (fora do catch de resolveSession)", async () => {
      vi.mocked(db.query).mockResolvedValue(dbRow({ password_change_required: 1 }) as never);
      await expect(call()).rejects.toSatisfy(
        (err: unknown) => err instanceof Error && !err.message.startsWith("Unauthorized"),
      );
    });

    it("marca o erro como já reportado (não é um bug de verdade, não deve duplicar no Sentry)", async () => {
      vi.mocked(db.query).mockResolvedValue(dbRow({ password_change_required: 1 }) as never);
      await expect(call()).rejects.toSatisfy((err: unknown) => isSentryReported(err));
    });

    it("requireAuthAllowExpiredPassword NÃO bloqueia, mesmo com passwordChangeRequired", async () => {
      vi.mocked(db.query).mockResolvedValue(dbRow({ password_change_required: 1 }) as never);
      const result = await (
        requireAuthAllowExpiredPassword as unknown as (opts: {
          next: (ctx: unknown) => unknown;
        }) => Promise<unknown>
      )({ next: (ctx: unknown) => ctx });
      expect(result).toMatchObject({ context: { userId: "u1" } });
    });
  });

  // Expiração por inatividade: cada request autenticado renova a sessão
  // "normal": sem isso, a sessão teria que ter prazo fixo desde o login.
  describe("sliding session", () => {
    it("reemite o cookie a cada request de uma sessão normal (não persistente)", async () => {
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

    it("não reemite o cookie de uma sessão 'manter conectado' (persistent)", async () => {
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

    it("rejeita sessão normal que passou do teto absoluto, mesmo com token ainda válido", async () => {
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

    // Transição: tokens emitidos antes desta mudança não têm `loginAt`, em
    // vez de expirar todo mundo no deploy, tratamos como login agora.
    it("trata token legado sem loginAt como login agora, sem expirar na hora", async () => {
      vi.mocked(jwt.verify).mockReturnValue({
        userId: "u1",
        role: "admin",
        tokenVersion: 0,
      } as never);
      await expect(call()).resolves.toMatchObject({ context: { userId: "u1" } });
      expect(setCookie).toHaveBeenCalled();
    });
  });

  // sentryFunctionErrorMiddleware (src/start.ts) recaptura qualquer erro que
  // saia daqui, já que fica fora de requireAuth na cadeia de middleware: sem
  // a marca, o mesmo erro vira dois eventos no Sentry.
  describe("marca de erro já reportado ao Sentry", () => {
    it("marca o erro de sessão inválida (JWT expirado)", async () => {
      vi.mocked(jwt.verify).mockImplementation(() => {
        throw new Error("jwt expired");
      });
      await expect(call()).rejects.toSatisfy((err: unknown) => isSentryReported(err));
    });

    it("marca o erro relançado de dentro de next()", async () => {
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
