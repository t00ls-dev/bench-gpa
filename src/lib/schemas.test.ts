import { describe, it, expect } from "vitest";
import {
  FilterSchema,
  AreaAnalysisSchema,
  UsernameSchema,
  EmployeeIdSchema,
  PasswordSchema,
  ProductionForecastSchema,
} from "./schemas";

describe("FilterSchema", () => {
  it("parses valid input with defaults", () => {
    const result = FilterSchema.parse({ dateFrom: "2024-01-01", dateTo: "2024-01-31" });
    expect(result.dateFrom).toBe("2024-01-01");
    expect(result.dateTo).toBe("2024-01-31");
    expect(result.stores).toEqual([]);
    expect(result.deptos).toEqual([]);
    expect(result.secoes).toEqual([]);
    expect(result.grupos).toEqual([]);
    expect(result.subgrupos).toEqual([]);
  });

  it("accepts optional fields", () => {
    const result = FilterSchema.parse({
      dateFrom: "2024-01-01",
      dateTo: "2024-01-31",
      stores: ["LOJA1"],
      deptos: ["D1"],
    });
    expect(result.stores).toEqual(["LOJA1"]);
    expect(result.deptos).toEqual(["D1"]);
  });

  it("accepts null dates", () => {
    const result = FilterSchema.parse({ dateFrom: null, dateTo: null });
    expect(result.dateFrom).toBeNull();
    expect(result.dateTo).toBeNull();
  });
});

describe("AreaAnalysisSchema", () => {
  it("parses with defaults", () => {
    const result = AreaAnalysisSchema.parse({ dateFrom: "2024-01-01", dateTo: "2024-01-31" });
    expect(result.pageSize).toBe(50);
    expect(result.search).toBe("");
    expect(result.sortBy).toBe("val");
    expect(result.sortDir).toBe("desc");
  });

  it("rejects missing dateFrom", () => {
    expect(() => AreaAnalysisSchema.parse({ dateTo: "2024-01-31" })).toThrow();
  });
});

describe("UsernameSchema", () => {
  it("accepts letters, digits, ._-", () => {
    expect(UsernameSchema.parse("joao.silva-1")).toBe("joao.silva-1");
  });

  it("normalizes to lowercase", () => {
    expect(UsernameSchema.parse("Joao.Silva")).toBe("joao.silva");
  });

  it("rejects a digits-only string: ambiguity with employee_id at login (WHERE username = ? OR employee_id = ?)", () => {
    expect(() => UsernameSchema.parse("12345")).toThrow();
  });

  it("rejects a character outside the charset", () => {
    expect(() => UsernameSchema.parse("joao@silva")).toThrow();
  });
});

describe("EmployeeIdSchema", () => {
  it("accepts a digits-only string", () => {
    expect(EmployeeIdSchema.parse("12345")).toBe("12345");
  });

  it("preserves a leading zero (no cast to number)", () => {
    expect(EmployeeIdSchema.parse("00099")).toBe("00099");
  });

  it("rejects a letter", () => {
    expect(() => EmployeeIdSchema.parse("123a5")).toThrow();
  });
});

describe("ProductionForecastSchema", () => {
  it("accepts a future date", () => {
    const result = ProductionForecastSchema.parse({ storeCode: "1516", targetDate: "2099-01-01" });
    expect(result.targetDate).toBe("2099-01-01");
  });

  it("accepts a past date: conferência of a day that already happened", () => {
    const result = ProductionForecastSchema.parse({ storeCode: "1516", targetDate: "2020-01-01" });
    expect(result.targetDate).toBe("2020-01-01");
  });

  it("rejects a malformed date string", () => {
    expect(() =>
      ProductionForecastSchema.parse({ storeCode: "1516", targetDate: "not-a-date" }),
    ).toThrow();
  });

  it("defaults secoes/grupos to empty arrays", () => {
    const result = ProductionForecastSchema.parse({ storeCode: "1516", targetDate: "2026-01-01" });
    expect(result.secoes).toEqual([]);
    expect(result.grupos).toEqual([]);
  });
});

describe("PasswordSchema", () => {
  it("accepts 8+ char password", () => {
    expect(PasswordSchema.parse("12345678")).toBe("12345678");
  });

  it("rejects short password", () => {
    expect(() => PasswordSchema.parse("1234567")).toThrow();
  });
});
