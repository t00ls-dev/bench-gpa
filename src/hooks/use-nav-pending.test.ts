import { describe, it, expect } from "vitest";
import { isNavPendingTo } from "./use-nav-pending";

describe("isNavPendingTo", () => {
  it("returns false when there is no pending navigation", () => {
    expect(isNavPendingTo(null, "/admin")).toBe(false);
  });

  it("matches the exact root path only", () => {
    expect(isNavPendingTo("/", "/")).toBe(true);
    expect(isNavPendingTo("/product", "/")).toBe(false);
  });

  it("matches a subroute by prefix when not exact", () => {
    expect(isNavPendingTo("/admin/docs", "/admin")).toBe(true);
  });

  it("does not treat a subroute as pending for an exact target", () => {
    // Regressão: "/admin" é prefixo de "/admin/docs", navegar para
    // Documentação não pode marcar Administração como pendente também.
    expect(isNavPendingTo("/admin/docs", "/admin", true)).toBe(false);
  });

  it("still matches the exact target itself (with or without trailing slash)", () => {
    expect(isNavPendingTo("/admin", "/admin", true)).toBe(true);
    expect(isNavPendingTo("/admin/", "/admin", true)).toBe(true);
  });
});
