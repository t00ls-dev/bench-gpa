import { describe, it, expect } from "vitest";
import { cn, pad2, fmtInt, fmtDT, fmtBRL, fmtBRShort } from "./utils";

describe("cn", () => {
  it("merges class names", () => {
    expect(cn("a", "b")).toBe("a b");
  });

  it("handles conditional classes", () => {
    expect(cn("base", false && "hidden", "visible")).toBe("base visible");
  });

  it("returns empty string for no input", () => {
    expect(cn()).toBe("");
  });
});

describe("pad2", () => {
  it("pads single digit", () => {
    expect(pad2(1)).toBe("01");
  });

  it("does not pad double digit", () => {
    expect(pad2(10)).toBe("10");
  });

  it("handles zero", () => {
    expect(pad2(0)).toBe("00");
  });
});

describe("fmtInt", () => {
  it("formats with pt-BR locale", () => {
    expect(fmtInt(1234)).toBe("1.234");
  });

  it("handles zero", () => {
    expect(fmtInt(0)).toBe("0");
  });
});

describe("fmtDT", () => {
  it("formats ISO date string", () => {
    const result = fmtDT("2024-03-15T14:30:00");
    expect(result).toMatch(/^15\/03\/24 14:30$/);
  });
});

describe("fmtBRL", () => {
  it("formats as BRL currency without cents", () => {
    const result = fmtBRL(1500);
    expect(result).toContain("R$");
    expect(result).toContain("1.500");
  });

  it("handles zero", () => {
    const result = fmtBRL(0);
    expect(result).toContain("0");
  });
});

describe("fmtBRShort", () => {
  it("returns fallback for null", () => {
    expect(fmtBRShort(null)).toBe("(sem)");
  });

  it("returns fallback for undefined", () => {
    expect(fmtBRShort(undefined)).toBe("(sem)");
  });

  it("formats ISO date string", () => {
    expect(fmtBRShort("2024-03-15")).toBe("15/03/24");
  });

  it("formats Date object", () => {
    const d = new Date(2024, 2, 15);
    expect(fmtBRShort(d)).toBe("15/03/24");
  });

  it("returns fallback for invalid string", () => {
    expect(fmtBRShort("not-a-date")).toBe("(sem)");
  });
});
