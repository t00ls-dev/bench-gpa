import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./db", () => ({ default: { query: vi.fn() } }));

import { assertAdmin } from "./admin-utils";
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
