import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import { parseAnyWorkbook, parseCellNumber } from "./xlsx-parser";

function makeWorkbook(rows: unknown[][]): ArrayBuffer {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
  return XLSX.write(wb, { type: "array", bookType: "xlsx" });
}

describe("xlsx-parser", () => {
  it("parses a minimal valid sales file", () => {
    const buf = makeWorkbook([
      [null, null, null, null, null, "001 - CENTRO", "002 - NORTE"],
      ["DTA_VENDA é 15/03/2024"],
      [null, null, null, null, "12345-PROD X", 100.5, 200.3],
    ]);
    const result = parseAnyWorkbook(buf);
    expect(result.kind).toBe("sales");
    expect(result.sale_date).toBe("2024-03-15");
    expect(result.sales).toHaveLength(2);
    expect(result.sales[0].prod_code).toBe("12345");
    expect(result.sales[0].val_vda).toBe(100.5);
    expect(result.sales[1].val_vda).toBe(200.3);
  });

  it("throws when date marker is missing", () => {
    const buf = makeWorkbook([["no date here"]]);
    expect(() => parseAnyWorkbook(buf)).toThrow("DTA_VENDA");
  });

  it("skips total rows and hierarchy totals", () => {
    const buf = makeWorkbook([
      [null, null, null, null, null, "001 - CENTRO"],
      ["DEP A", null, "Total"],
      ["DTA_VENDA é 10/06/2024"],
      ["Total do Depto", null],
      [null, "Total da Seção", null],
      [null, null, "Total do Grupo", null],
      [null, null, null, "Total do Subgrupo"],
      [null, null, null, null, "99999-ITEM", 50],
    ]);
    const result = parseAnyWorkbook(buf);
    expect(result.sales).toHaveLength(1);
    expect(result.sales[0].prod_code).toBe("99999");
  });

  it("extracts store list", () => {
    const buf = makeWorkbook([
      [null, null, null, null, null, "001 - CENTRO", "002 - SUL"],
      ["DTA_VENDA é 01/01/2024"],
      [null, null, null, null, "001-PROD", 10, 20],
    ]);
    const result = parseAnyWorkbook(buf);
    expect(result.stores).toHaveLength(2);
    expect(result.stores[0].store_code).toBe("001");
    expect(result.stores[1].store_name).toBe("SUL");
  });

  it("skips 'Total' header column", () => {
    const buf = makeWorkbook([
      [null, null, null, null, null, "001 - CENTRO", "Total", "002 - SUL"],
      ["DTA_VENDA é 01/06/2024"],
      [null, null, null, null, "001-PROD", 10, 20],
    ]);
    const result = parseAnyWorkbook(buf);
    expect(result.stores).toHaveLength(2);
  });

  it("handles empty rows gracefully", () => {
    const buf = makeWorkbook([
      [null, null, null, null, null, "001 - CENTRO"],
      ["DTA_VENDA é 01/01/2024"],
      [null, null, null, null, null, null],
      [null, null, null, null, "001-PROD", 10],
    ]);
    const result = parseAnyWorkbook(buf);
    expect(result.sales).toHaveLength(1);
    expect(result.sales[0].prod_code).toBe("001");
  });

  it("parses value with comma decimal", () => {
    const buf = makeWorkbook([
      [null, null, null, null, null, "001 - CENTRO"],
      ["DTA_VENDA é 01/01/2024"],
      [null, null, null, null, "001-PROD", "1500,50"],
    ]);
    const result = parseAnyWorkbook(buf);
    expect(result.sales[0].val_vda).toBe(1500.5);
  });

  it("preserva o separador de milhar pt-BR ponta a ponta", () => {
    const buf = makeWorkbook([
      [null, null, null, null, null, "001 - CENTRO"],
      ["DTA_VENDA é 01/01/2024"],
      [null, null, null, null, "001-PROD", "1.234.567,89"],
    ]);
    const result = parseAnyWorkbook(buf);
    expect(result.sales[0].val_vda).toBe(1234567.89);
  });

  it("emite categorias nulas quando não há hierarquia (gatilho do bug do staging '0')", () => {
    // Produto sem nenhuma linha de Total de hierarquia acima dele: depto/secao/
    // grupo/subgrupo devem sair NULL — nunca "" nem 0.
    const buf = makeWorkbook([
      [null, null, null, null, null, "001 - CENTRO"],
      ["DTA_VENDA é 01/01/2024"],
      [null, null, null, null, "12345-PROD SEM HIER", 42],
    ]);
    const result = parseAnyWorkbook(buf);
    expect(result.sales).toHaveLength(1);
    expect(result.sales[0].depto).toBeNull();
    expect(result.sales[0].secao).toBeNull();
    expect(result.sales[0].grupo).toBeNull();
    expect(result.sales[0].subgrupo).toBeNull();
  });

  it("builds product map", () => {
    const buf = makeWorkbook([
      [null, null, null, null, null, "001 - CENTRO"],
      ["DTA_VENDA é 01/01/2024"],
      [null, null, null, null, "001-PROD A", 10],
      [null, null, null, null, "002-PROD B", 20],
    ]);
    const result = parseAnyWorkbook(buf);
    expect(result.products).toHaveLength(2);
    expect(result.products.find((p) => p.prod_code === "001")?.prod_name).toBe("PROD A");
  });
});

describe("parseCellNumber", () => {
  it("passa números adiante sem tocar", () => {
    expect(parseCellNumber(1234.56)).toBe(1234.56);
    expect(parseCellNumber(0)).toBe(0);
    expect(parseCellNumber(-42)).toBe(-42);
  });

  it("trata vazio, nulo e lixo não numérico como 0", () => {
    expect(parseCellNumber(null)).toBe(0);
    expect(parseCellNumber(undefined)).toBe(0);
    expect(parseCellNumber("")).toBe(0);
    expect(parseCellNumber("   ")).toBe(0);
    expect(parseCellNumber("n/d")).toBe(0);
    expect(parseCellNumber(NaN)).toBe(0);
    expect(parseCellNumber(Infinity)).toBe(0);
  });

  it("lê decimal pt-BR com vírgula", () => {
    expect(parseCellNumber("1500,50")).toBe(1500.5);
    expect(parseCellNumber("0,99")).toBe(0.99);
    expect(parseCellNumber("-12,5")).toBe(-12.5);
  });

  it("combina milhar e decimal pt-BR (a regressão do bug)", () => {
    // Antes: .replace(",", ".") trocava só a primeira vírgula e mantinha os
    // pontos de milhar → "1.234,56" virava 1.234, mil vezes menor.
    expect(parseCellNumber("1.234,56")).toBe(1234.56);
    expect(parseCellNumber("1.234.567,89")).toBe(1234567.89);
    expect(parseCellNumber("-1.234,56")).toBe(-1234.56);
  });

  it("entende ponto como milhar quando não há vírgula", () => {
    expect(parseCellNumber("1.234")).toBe(1234);
    expect(parseCellNumber("12.345")).toBe(12345);
    expect(parseCellNumber("1.234.567")).toBe(1234567);
  });

  it("mantém o ponto como decimal quando não delimita grupos de 3", () => {
    expect(parseCellNumber("1.23")).toBe(1.23);
    expect(parseCellNumber("1.2345")).toBe(1.2345);
    expect(parseCellNumber("1234.56")).toBe(1234.56);
    expect(parseCellNumber("0.5")).toBe(0.5);
  });

  it("ignora símbolo de moeda e espaços ao redor do número", () => {
    expect(parseCellNumber("R$ 1.234,56")).toBe(1234.56);
    expect(parseCellNumber("  789,10  ")).toBe(789.1);
    expect(parseCellNumber("R$ 2.500,00")).toBe(2500);
  });
});
