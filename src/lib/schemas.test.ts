import { describe, it, expect } from "vitest";
import {
  FilterSchema,
  DashboardSchema,
  AreaAnalysisSchema,
  EmailSchema,
  PasswordSchema,
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

describe("DashboardSchema", () => {
  it("defaults compare to prev_period", () => {
    const result = DashboardSchema.parse({ dateFrom: "2024-01-01", dateTo: "2024-01-31" });
    expect(result.compare).toBe("prev_period");
  });

  it("accepts explicit compare", () => {
    const result = DashboardSchema.parse({
      dateFrom: "2024-01-01",
      dateTo: "2024-01-31",
      compare: "prev_week",
    });
    expect(result.compare).toBe("prev_week");
  });

  it("rejects invalid compare value", () => {
    expect(() =>
      DashboardSchema.parse({ dateFrom: "2024-01-01", dateTo: "2024-01-31", compare: "invalid" }),
    ).toThrow();
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

describe("EmailSchema", () => {
  it("accepts valid gpabr email", () => {
    expect(EmailSchema.parse("user@gpabr.com")).toBe("user@gpabr.com");
  });

  it("rejects non-gpabr email", () => {
    expect(() => EmailSchema.parse("user@gmail.com")).toThrow();
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
