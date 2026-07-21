import { describe, it, expect, vi, beforeEach } from "vitest";

process.env.JWT_SECRET = "test-secret";

vi.mock("@tanstack/react-start", () => ({
  createMiddleware: () => ({
    server: (fn: Function) => fn,
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
  vi.mocked(jwt.verify).mockReturnValue({ userId: "u1", role: "admin", email: "test@gpabr.com" } as never);
  vi.mocked(db.query).mockResolvedValue([[{ id: "u1", role: "admin", is_active: true }]] as never);
});

describe("requireAuth", () => {
  it("passes context with valid token and active user", async () => {
    const result = await (requireAuth as unknown as (opts: { next: (ctx: unknown) => unknown }) => Promise<unknown>)({ next: (ctx: unknown) => ctx });
    expect(result).toMatchObject({
      context: { userId: "u1", userRole: "admin", userEmail: "test@gpabr.com" },
    });
    expect(jwt.verify).toHaveBeenCalledWith("valid-jwt", "test-secret");
  });

  it("throws when user is inactive", async () => {
    vi.mocked(db.query).mockResolvedValue([[{ id: "u1", role: "admin", is_active: false }]] as never);
    await expect((requireAuth as unknown as (opts: { next: (ctx: unknown) => unknown }) => Promise<unknown>)({ next: (ctx: unknown) => ctx })).rejects.toThrow("Unauthorized");
  });

  it("throws when JWT is expired", async () => {
    vi.mocked(jwt.verify).mockImplementation(() => { throw new Error("jwt expired"); });
    await expect((requireAuth as unknown as (opts: { next: (ctx: unknown) => unknown }) => Promise<unknown>)({ next: (ctx: unknown) => ctx })).rejects.toThrow("Unauthorized: invalid token");
  });

  it("throws when JWT signature is invalid", async () => {
    vi.mocked(jwt.verify).mockImplementation(() => { throw new Error("invalid signature"); });
    await expect((requireAuth as unknown as (opts: { next: (ctx: unknown) => unknown }) => Promise<unknown>)({ next: (ctx: unknown) => ctx })).rejects.toThrow("Unauthorized: invalid token");
  });

  it("throws when user not found in DB", async () => {
    vi.mocked(db.query).mockResolvedValue([[]] as never);
    await expect((requireAuth as unknown as (opts: { next: (ctx: unknown) => unknown }) => Promise<unknown>)({ next: (ctx: unknown) => ctx })).rejects.toThrow("Unauthorized");
  });
});
