import { describe, it, expect } from "vitest";
import { safeError } from "./safe-error";

describe("safeError", () => {
  it("returns generic message by default", () => {
    const err = safeError("test", new Error("db failure"));
    expect(err.message).toBe("Ocorreu um erro interno. Tente novamente.");
  });

  it("includes userMessage when provided", () => {
    const err = safeError("test", new Error("db failure"), "Algo deu errado.");
    expect(err.message).toBe("Algo deu errado.");
  });

  it("shows raw error when showRawError is true", () => {
    const err = safeError("test", new Error("db failure"), undefined, true);
    expect(err.message).toBe("db failure");
  });

  it("handles non-Error objects", () => {
    const err = safeError("test", { code: 500, message: "internal" }, undefined, true);
    expect(err.message).toContain("internal");
  });

  it("handles null/undefined error", () => {
    const err = safeError("test", null, "deu ruim");
    expect(err.message).toBe("deu ruim");
  });

  it("handles string error", () => {
    const err = safeError("test", "string error", undefined, true);
    expect(err.message).toBe("string error");
  });

  it("preserves error cause", () => {
    const cause = new Error("original");
    const err = safeError("test", cause);
    expect(err.cause).toBe(cause);
  });

  it("falls back to generic when userMessage is empty and showRawError false", () => {
    const err = safeError("test", new Error("hidden"));
    expect(err.message).not.toContain("hidden");
  });
});
