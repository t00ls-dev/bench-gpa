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
    // Ainda não é admin: o `false` fica cacheado.
    mockQuery.mockResolvedValue([[[{ has_role: 0 }]]]);
    await expect(assertAdmin({ userId: "u-promovido" })).rejects.toThrow("Apenas administradores");
    await expect(assertAdmin({ userId: "u-promovido" })).rejects.toThrow("Apenas administradores");
    expect(mockQuery).toHaveBeenCalledTimes(1); // 2ª veio do cache negativo

    // Promovido no banco. Sem invalidar, o `false` cacheado seguiria negando
    // acesso por até 5 minutos — o sintoma que mais aparecia no uso diário.
    mockQuery.mockResolvedValue([[[{ has_role: 1 }]]]);
    invalidateAdminCache("u-promovido");
    await expect(assertAdmin({ userId: "u-promovido" })).resolves.toBeUndefined();
    expect(mockQuery).toHaveBeenCalledTimes(2);
  });

  it("revogação tira o acesso na hora", async () => {
    mockQuery.mockResolvedValue([[[{ has_role: 1 }]]]);
    await expect(assertAdmin({ userId: "u-revogado" })).resolves.toBeUndefined();

    // has_role filtra por role E is_active, então inativar tem o mesmo efeito.
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
    expect(mockQuery).not.toHaveBeenCalled(); // seguiu vindo do cache
  });

  it("invalidar um usuário nunca visto é inofensivo", () => {
    expect(() => invalidateAdminCache("u-inexistente")).not.toThrow();
  });
});
