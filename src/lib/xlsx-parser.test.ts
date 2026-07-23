import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import { parseAnyWorkbook } from "./xlsx-parser";

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
