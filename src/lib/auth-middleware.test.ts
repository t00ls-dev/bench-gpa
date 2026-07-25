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
}));

vi.mock("./db", () => ({ default: { query: vi.fn() } }));
vi.mock("jsonwebtoken", () => ({ default: { verify: vi.fn() } }));
vi.mock("cookie", () => ({
  parse: vi.fn(() => ({ session: "valid-jwt" })),
}));

import { requireAuth } from "./auth-middleware";
import db from "./db";
import jwt from "jsonwebtoken";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(jwt.verify).mockReturnValue({
    userId: "u1",
    role: "admin",
    email: "test@gpabr.com",
    tokenVersion: 0,
  } as never);
  vi.mocked(db.query).mockResolvedValue([
    [{ id: "u1", role: "admin", is_active: true, token_version: 0 }],
  ] as never);
});

const call = () =>
  (requireAuth as unknown as (opts: { next: (ctx: unknown) => unknown }) => Promise<unknown>)({
    next: (ctx: unknown) => ctx,
  });

describe("requireAuth", () => {
  it("passes context with valid token and active user", async () => {
    const result = await (
      requireAuth as unknown as (opts: { next: (ctx: unknown) => unknown }) => Promise<unknown>
    )({ next: (ctx: unknown) => ctx });
    expect(result).toMatchObject({
      context: { userId: "u1", userRole: "admin", userEmail: "test@gpabr.com" },
    });
    expect(jwt.verify).toHaveBeenCalledWith("valid-jwt", "test-secret");
  });

  it("throws when user is inactive", async () => {
    vi.mocked(db.query).mockResolvedValue([
      [{ id: "u1", role: "admin", is_active: false }],
    ] as never);
    await expect(
      (requireAuth as unknown as (opts: { next: (ctx: unknown) => unknown }) => Promise<unknown>)({
        next: (ctx: unknown) => ctx,
      }),
    ).rejects.toThrow("Unauthorized");
  });

  it("throws when JWT is expired", async () => {
    vi.mocked(jwt.verify).mockImplementation(() => {
      throw new Error("jwt expired");
    });
    await expect(
      (requireAuth as unknown as (opts: { next: (ctx: unknown) => unknown }) => Promise<unknown>)({
        next: (ctx: unknown) => ctx,
      }),
    ).rejects.toThrow("Unauthorized: invalid token");
  });

  it("throws when JWT signature is invalid", async () => {
    vi.mocked(jwt.verify).mockImplementation(() => {
      throw new Error("invalid signature");
    });
    await expect(
      (requireAuth as unknown as (opts: { next: (ctx: unknown) => unknown }) => Promise<unknown>)({
        next: (ctx: unknown) => ctx,
      }),
    ).rejects.toThrow("Unauthorized: invalid token");
  });

  it("throws when user not found in DB", async () => {
    vi.mocked(db.query).mockResolvedValue([[]] as never);
    await expect(
      (requireAuth as unknown as (opts: { next: (ctx: unknown) => unknown }) => Promise<unknown>)({
        next: (ctx: unknown) => ctx,
      }),
    ).rejects.toThrow("Unauthorized");
  });

  // Revogação de sessão: resetPassword incrementa users.token_version, e todo
  // token emitido antes precisa parar de valer no request seguinte.
  describe("token_version", () => {
    it("rejeita token emitido antes do reset de senha", async () => {
      vi.mocked(jwt.verify).mockReturnValue({
        userId: "u1",
        role: "admin",
        email: "test@gpabr.com",
        tokenVersion: 2,
      } as never);
      vi.mocked(db.query).mockResolvedValue([
        [{ id: "u1", role: "admin", is_active: true, token_version: 3 }],
      ] as never);
      await expect(call()).rejects.toThrow("Unauthorized: session revoked");
    });

    it("aceita token emitido depois do reset", async () => {
      vi.mocked(jwt.verify).mockReturnValue({
        userId: "u1",
        role: "admin",
        email: "test@gpabr.com",
        tokenVersion: 3,
      } as never);
      vi.mocked(db.query).mockResolvedValue([
        [{ id: "u1", role: "admin", is_active: true, token_version: 3 }],
      ] as never);
      await expect(call()).resolves.toMatchObject({ context: { userId: "u1" } });
    });

    // Transição: os tokens já em circulação quando a coluna foi criada não têm
    // o campo no payload. Como a coluna nasce em 0, eles seguem válidos até
    // expirar — o deploy não desloga ninguém.
    it("aceita token legado sem tokenVersion enquanto a coluna estiver em 0", async () => {
      vi.mocked(jwt.verify).mockReturnValue({
        userId: "u1",
        role: "admin",
        email: "test@gpabr.com",
      } as never);
      await expect(call()).resolves.toMatchObject({ context: { userId: "u1" } });
    });

    it("rejeita token legado assim que a senha for redefinida uma vez", async () => {
      vi.mocked(jwt.verify).mockReturnValue({
        userId: "u1",
        role: "admin",
        email: "test@gpabr.com",
      } as never);
      vi.mocked(db.query).mockResolvedValue([
        [{ id: "u1", role: "admin", is_active: true, token_version: 1 }],
      ] as never);
      await expect(call()).rejects.toThrow("Unauthorized: session revoked");
    });
  });

  // O papel no contexto tem que sair do banco: o JWT carrega o que valia na
  // emissão, e um usuário rebaixado seguiria "admin" no contexto por até 7 dias.
  it("usa o role do banco, não o congelado no token", async () => {
    vi.mocked(jwt.verify).mockReturnValue({
      userId: "u1",
      role: "admin",
      email: "test@gpabr.com",
      tokenVersion: 0,
    } as never);
    vi.mocked(db.query).mockResolvedValue([
      [{ id: "u1", role: "user", is_active: true, token_version: 0 }],
    ] as never);
    await expect(call()).resolves.toMatchObject({ context: { userRole: "user" } });
  });
});
