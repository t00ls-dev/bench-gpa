import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import { parseAnyWorkbook, parseCellNumber } from "./xlsx-parser";

function makeWorkbook(rows: unknown[][]): ArrayBuffer {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
  return XLSX.write(wb, { type: "array", bookType: "xlsx" });
}

// .xls (legacy binary, BIFF8): the dropzone accepts the extension
// (upload-dropzone.tsx: accept=".xlsx,.xls"), but nothing tested this format.
function makeWorkbookXls(rows: unknown[][]): ArrayBuffer {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
  return XLSX.write(wb, { type: "array", bookType: "xls" });
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

  it("throws an error (doesn't hang, doesn't return garbage) for a corrupted/non-xlsx file", () => {
    const garbage = new TextEncoder().encode("isto não é um arquivo xlsx válido").buffer;
    expect(() => parseAnyWorkbook(garbage)).toThrow();
  });

  it("does not throw for a file with the date marker but zero product rows", () => {
    // Important difference from the "corrupted file" case: here the file is
    // valid and the marker exists: there's just no product after it. The
    // parser returns empty lists instead of throwing; deciding whether this
    // is a business error is up to the caller (beginImport.total_rows===0
    // on the web path; scripts/import.ts needs the same guard, see the
    // test below).
    const buf = makeWorkbook([
      [null, null, null, null, null, "001 - CENTRO"],
      ["DTA_VENDA é 01/01/2024"],
    ]);
    const result = parseAnyWorkbook(buf);
    expect(result.sales).toEqual([]);
    expect(result.stores).toHaveLength(1);
    expect(result.products).toEqual([]);
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

  // The test above ("skips total rows...") proves that Total labels OUT OF
  // format (e.g. the spelled-out "Total do Depto") are safely ignored, but
  // it never triggers the 4 real assignment branches: the trigger requires
  // the EXACT adjacent "Total" label (see `isVal`/checks in
  // xlsx-parser.ts). This block covers the path product categorization
  // actually uses.
  it("assigns real depto/seção/grupo/subgrupo when the 'Total' label is exactly adjacent", () => {
    const buf = makeWorkbook([
      [null, null, null, null, null, "001 - CENTRO"],
      ["DTA_VENDA é 01/07/2024"],
      ["MERCEARIA", "Total"],
      [null, "BEBIDAS", "Total"],
      [null, null, "REFRIGERANTES", "Total"],
      [null, null, null, "COLA", "Total"],
      [null, null, null, null, "123-COCA-COLA 2L", 99.9],
    ]);
    const result = parseAnyWorkbook(buf);
    expect(result.sales).toHaveLength(1);
    expect(result.sales[0]).toMatchObject({
      depto: "MERCEARIA",
      secao: "BEBIDAS",
      grupo: "REFRIGERANTES",
      subgrupo: "COLA",
    });
  });

  it("resets seção/grupo/subgrupo on entering a new depto", () => {
    const buf = makeWorkbook([
      [null, null, null, null, null, "001 - CENTRO"],
      ["DTA_VENDA é 01/07/2024"],
      ["MERCEARIA", "Total"],
      [null, "BEBIDAS", "Total"],
      [null, null, "REFRIGERANTES", "Total"],
      [null, null, null, "COLA", "Total"],
      [null, null, null, null, "111-ITEM DA COLA", 10],
      // New depto with no seção/grupo/subgrupo declared below it: the
      // following product must not inherit BEBIDAS/REFRIGERANTES/COLA.
      ["LIMPEZA", "Total"],
      [null, null, null, null, "222-ITEM SEM SUBHIERARQUIA", 20],
    ]);
    const result = parseAnyWorkbook(buf);
    expect(result.sales).toHaveLength(2);
    const item1 = result.sales.find((s) => s.prod_code === "111")!;
    expect(item1).toMatchObject({
      depto: "MERCEARIA",
      secao: "BEBIDAS",
      grupo: "REFRIGERANTES",
      subgrupo: "COLA",
    });
    const item2 = result.sales.find((s) => s.prod_code === "222")!;
    expect(item2.depto).toBe("LIMPEZA");
    expect(item2.secao).toBeNull();
    expect(item2.grupo).toBeNull();
    expect(item2.subgrupo).toBeNull();
  });

  it("resets only grupo/subgrupo on entering a new seção, keeping the depto", () => {
    const buf = makeWorkbook([
      [null, null, null, null, null, "001 - CENTRO"],
      ["DTA_VENDA é 01/07/2024"],
      ["MERCEARIA", "Total"],
      [null, "BEBIDAS", "Total"],
      [null, null, "REFRIGERANTES", "Total"],
      [null, null, null, "COLA", "Total"],
      [null, null, null, null, "111-ITEM DA COLA", 10],
      // New seção under the SAME depto: grupo/subgrupo from the previous
      // seção must not leak into this new seção's item.
      [null, "LATICÍNIOS", "Total"],
      [null, null, null, null, "333-ITEM DE LATICÍNIOS", 20],
    ]);
    const result = parseAnyWorkbook(buf);
    const item2 = result.sales.find((s) => s.prod_code === "333")!;
    expect(item2).toMatchObject({
      depto: "MERCEARIA",
      secao: "LATICÍNIOS",
      grupo: null,
      subgrupo: null,
    });
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

  it("preserves the pt-BR thousands separator end to end", () => {
    const buf = makeWorkbook([
      [null, null, null, null, null, "001 - CENTRO"],
      ["DTA_VENDA é 01/01/2024"],
      [null, null, null, null, "001-PROD", "1.234.567,89"],
    ]);
    const result = parseAnyWorkbook(buf);
    expect(result.sales[0].val_vda).toBe(1234567.89);
  });

  it("emits null categories when there is no hierarchy (trigger for the staging '0' bug)", () => {
    // Product with no Total row of hierarchy above it: depto/secao/
    // grupo/subgrupo must come out NULL, never "" or 0.
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

  it("correctly reads a legacy .xls file (binary BIFF8), not just .xlsx", () => {
    // The dropzone accepts the extension (upload-dropzone.tsx:
    // accept=".xlsx,.xls"), but nothing tested this format:
    // parseAnyWorkbook uses the same XLSX.read() for both, which detects
    // the format from the buffer's content, not the filename's extension
    // (which the parser doesn't even receive).
    const buf = makeWorkbookXls([
      [null, null, null, null, null, "001 - CENTRO"],
      ["DTA_VENDA é 01/01/2024"],
      [null, null, null, null, "12345-PROD LEGADO", 42],
    ]);
    const result = parseAnyWorkbook(buf);
    expect(result.sale_date).toBe("2024-01-01");
    expect(result.sales).toHaveLength(1);
    expect(result.sales[0].prod_code).toBe("12345");
    expect(result.sales[0].val_vda).toBe(42);
  });

  it("preserves accents and emoji in store/product names without corrupting them", () => {
    const buf = makeWorkbook([
      [null, null, null, null, null, "001 - AÇAÍ 🎉 SHOPPING"],
      ["DTA_VENDA é 01/01/2024"],
      [null, null, null, null, "12345-PÃO DE AÇÚCAR ñoño 日本語", 10],
    ]);
    const result = parseAnyWorkbook(buf);
    expect(result.stores[0].store_name).toBe("AÇAÍ 🎉 SHOPPING");
    expect(result.products[0].prod_name).toBe("PÃO DE AÇÚCAR ñoño 日本語");
  });

  it("reads only the first sheet when the file has multiple tabs", () => {
    const wb = XLSX.utils.book_new();
    const ws1 = XLSX.utils.aoa_to_sheet([
      [null, null, null, null, null, "001 - CENTRO"],
      ["DTA_VENDA é 01/01/2024"],
      [null, null, null, null, "111-PROD DA ABA 1", 10],
    ]);
    const ws2 = XLSX.utils.aoa_to_sheet([
      [null, null, null, null, null, "002 - NORTE"],
      ["DTA_VENDA é 02/01/2024"],
      [null, null, null, null, "222-PROD DA ABA 2", 20],
    ]);
    XLSX.utils.book_append_sheet(wb, ws1, "Aba1");
    XLSX.utils.book_append_sheet(wb, ws2, "Aba2");
    const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" });

    const result = parseAnyWorkbook(buf);
    expect(result.sale_date).toBe("2024-01-01");
    expect(result.products.map((p) => p.prod_code)).toEqual(["111"]);
    expect(result.products.map((p) => p.prod_code)).not.toContain("222");
  });

  it("does not merge duplicate rows for the same product/store, each row becomes a sale", () => {
    // finalize_import (migrate-schema.sql) is what sums via GROUP BY/SUM in
    // the database; the parser itself doesn't dedupe or merge anything, it
    // just passes each row through as a separate sale.
    const buf = makeWorkbook([
      [null, null, null, null, null, "001 - CENTRO"],
      ["DTA_VENDA é 01/01/2024"],
      [null, null, null, null, "111-PROD DUPLICADO", 10],
      [null, null, null, null, "111-PROD DUPLICADO", 25],
    ]);
    const result = parseAnyWorkbook(buf);
    expect(result.sales).toHaveLength(2);
    expect(result.sales.map((s) => s.val_vda)).toEqual([10, 25]);
    // productMap is a Map keyed by code: the second occurrence doesn't
    // duplicate the entry, it only "wins" if the name changes (it doesn't
    // here).
    expect(result.products).toHaveLength(1);
  });
});

describe("parseCellNumber", () => {
  it("passes numbers through untouched", () => {
    expect(parseCellNumber(1234.56)).toBe(1234.56);
    expect(parseCellNumber(0)).toBe(0);
    expect(parseCellNumber(-42)).toBe(-42);
  });

  it("treats empty, null, and non-numeric garbage as 0", () => {
    expect(parseCellNumber(null)).toBe(0);
    expect(parseCellNumber(undefined)).toBe(0);
    expect(parseCellNumber("")).toBe(0);
    expect(parseCellNumber("   ")).toBe(0);
    expect(parseCellNumber("n/d")).toBe(0);
    expect(parseCellNumber(NaN)).toBe(0);
    expect(parseCellNumber(Infinity)).toBe(0);
  });

  it("reads pt-BR decimal with a comma", () => {
    expect(parseCellNumber("1500,50")).toBe(1500.5);
    expect(parseCellNumber("0,99")).toBe(0.99);
    expect(parseCellNumber("-12,5")).toBe(-12.5);
  });

  it("combines pt-BR thousands and decimal (the bug's regression)", () => {
    // Before: .replace(",", ".") only swapped the first comma and kept the
    // thousands dots -> "1.234,56" became 1.234, a thousand times smaller.
    expect(parseCellNumber("1.234,56")).toBe(1234.56);
    expect(parseCellNumber("1.234.567,89")).toBe(1234567.89);
    expect(parseCellNumber("-1.234,56")).toBe(-1234.56);
  });

  it("understands a dot as thousands when there's no comma", () => {
    expect(parseCellNumber("1.234")).toBe(1234);
    expect(parseCellNumber("12.345")).toBe(12345);
    expect(parseCellNumber("1.234.567")).toBe(1234567);
  });

  it("keeps the dot as decimal when it doesn't delimit groups of 3", () => {
    expect(parseCellNumber("1.23")).toBe(1.23);
    expect(parseCellNumber("1.2345")).toBe(1.2345);
    expect(parseCellNumber("1234.56")).toBe(1234.56);
    expect(parseCellNumber("0.5")).toBe(0.5);
  });

  it("ignores currency symbol and surrounding whitespace around the number", () => {
    expect(parseCellNumber("R$ 1.234,56")).toBe(1234.56);
    expect(parseCellNumber("  789,10  ")).toBe(789.1);
    expect(parseCellNumber("R$ 2.500,00")).toBe(2500);
  });
});
