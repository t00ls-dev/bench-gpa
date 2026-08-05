import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./db", () => ({ default: { query: vi.fn() } }));

import { assertAdmin, invalidateAdminCache } from "./admin-utils";
import db from "./db";

const mockQuery = db.query as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("assertAdmin", () => {
  it("resolves when user has admin role", async () => {
    mockQuery.mockResolvedValue([[[{ has_role: 1 }]]]);
    await expect(assertAdmin({ userId: "u1" })).resolves.toBeUndefined();
    expect(mockQuery).toHaveBeenCalledWith("CALL has_role(?, ?)", ["u1", "admin"]);
  });

  it("caches admin result and skips DB on second call", async () => {
    mockQuery.mockResolvedValue([[[{ has_role: 1 }]]]);
    await assertAdmin({ userId: "u-cache-hit" });
    await assertAdmin({ userId: "u-cache-hit" });
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });

  it("throws when user is not admin", async () => {
    mockQuery.mockResolvedValue([[[{ has_role: 0 }]]]);
    await expect(assertAdmin({ userId: "u2" })).rejects.toThrow("Apenas administradores");
  });

  it("throws when has_role is falsy from empty result", async () => {
    mockQuery.mockResolvedValue([[[]]]);
    await expect(assertAdmin({ userId: "u3" })).rejects.toThrow("Apenas administradores");
  });
});

describe("invalidateAdminCache", () => {
  it("promoção passa a valer na hora, sem esperar o TTL de 5 min", async () => {
    // Not yet an admin: the `false` gets cached.
    mockQuery.mockResolvedValue([[[{ has_role: 0 }]]]);
    await expect(assertAdmin({ userId: "u-promovido" })).rejects.toThrow("Apenas administradores");
    await expect(assertAdmin({ userId: "u-promovido" })).rejects.toThrow("Apenas administradores");
    expect(mockQuery).toHaveBeenCalledTimes(1); // 2nd call came from the negative cache

    // Promoted in the database. Without invalidating, the cached `false`
    // would keep denying access for up to 5 minutes: the symptom that
    // showed up most in daily use.
    mockQuery.mockResolvedValue([[[{ has_role: 1 }]]]);
    invalidateAdminCache("u-promovido");
    await expect(assertAdmin({ userId: "u-promovido" })).resolves.toBeUndefined();
    expect(mockQuery).toHaveBeenCalledTimes(2);
  });

  it("revogação tira o acesso na hora", async () => {
    mockQuery.mockResolvedValue([[[{ has_role: 1 }]]]);
    await expect(assertAdmin({ userId: "u-revogado" })).resolves.toBeUndefined();

    // has_role filters by role AND is_active, so deactivating has the same effect.
    mockQuery.mockResolvedValue([[[{ has_role: 0 }]]]);
    invalidateAdminCache("u-revogado");
    await expect(assertAdmin({ userId: "u-revogado" })).rejects.toThrow("Apenas administradores");
  });

  it("invalidar um usuário não afeta o veredito dos outros", async () => {
    mockQuery.mockResolvedValue([[[{ has_role: 1 }]]]);
    await assertAdmin({ userId: "u-intocado" });
    vi.clearAllMocks();

    invalidateAdminCache("u-outro-qualquer");

    await expect(assertAdmin({ userId: "u-intocado" })).resolves.toBeUndefined();
    expect(mockQuery).not.toHaveBeenCalled(); // kept coming from cache
  });

  it("invalidar um usuário nunca visto é inofensivo", () => {
    expect(() => invalidateAdminCache("u-inexistente")).not.toThrow();
  });
});
