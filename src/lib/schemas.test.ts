import { describe, it, expect } from "vitest";
import {
  FilterSchema,
  AreaAnalysisSchema,
  UsernameSchema,
  MatriculaSchema,
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

  it("normaliza para minúsculas", () => {
    expect(UsernameSchema.parse("Joao.Silva")).toBe("joao.silva");
  });

  it("rejeita string só de dígitos: ambiguidade com matrícula no login (WHERE username = ? OR matricula = ?)", () => {
    expect(() => UsernameSchema.parse("12345")).toThrow();
  });

  it("rejeita caractere fora do charset", () => {
    expect(() => UsernameSchema.parse("joao@silva")).toThrow();
  });
});

describe("MatriculaSchema", () => {
  it("aceita string só de dígitos", () => {
    expect(MatriculaSchema.parse("12345")).toBe("12345");
  });

  it("preserva zero à esquerda (sem cast pra número)", () => {
    expect(MatriculaSchema.parse("00099")).toBe("00099");
  });

  it("rejeita letra", () => {
    expect(() => MatriculaSchema.parse("123a5")).toThrow();
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
