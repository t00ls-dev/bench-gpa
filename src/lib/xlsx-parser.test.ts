import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import { parseAnyWorkbook, parseCellNumber } from "./xlsx-parser";

function makeWorkbook(rows: unknown[][]): ArrayBuffer {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
  return XLSX.write(wb, { type: "array", bookType: "xlsx" });
}

// .xls (binário legado, BIFF8): o dropzone aceita a extensão
// (upload-dropzone.tsx: accept=".xlsx,.xls"), mas nada testava esse formato.
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

  it("lança um erro (não trava, não devolve lixo) para um arquivo corrompido/não-xlsx", () => {
    const garbage = new TextEncoder().encode("isto não é um arquivo xlsx válido").buffer;
    expect(() => parseAnyWorkbook(garbage)).toThrow();
  });

  it("não lança para um arquivo com o marcador de data mas zero linhas de produto", () => {
    // Diferença importante do caso "arquivo corrompido": aqui o arquivo é
    // válido e o marcador existe: só não há nenhum produto depois dele.
    // O parser devolve listas vazias em vez de lançar; quem decide se isso é
    // um erro de negócio é o chamador (beginImport.total_rows===0 no caminho
    // web; scripts/import.ts precisa do mesmo guard, ver teste abaixo).
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

  // O teste acima ("skips total rows...") prova que rótulos de Total FORA de
  // formato (ex.: "Total do Depto" por extenso) são ignorados com segurança,
  // mas nunca dispara os 4 branches reais de atribuição: o gatilho exige o
  // rótulo "Total" adjacente EXATO (ver `isVal`/checks em xlsx-parser.ts).
  // Este bloco cobre o caminho que a categorização de produto realmente usa.
  it("atribui depto/seção/grupo/subgrupo reais quando o rótulo 'Total' vem exatamente adjacente", () => {
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

  it("reseta seção/grupo/subgrupo ao entrar num novo depto", () => {
    const buf = makeWorkbook([
      [null, null, null, null, null, "001 - CENTRO"],
      ["DTA_VENDA é 01/07/2024"],
      ["MERCEARIA", "Total"],
      [null, "BEBIDAS", "Total"],
      [null, null, "REFRIGERANTES", "Total"],
      [null, null, null, "COLA", "Total"],
      [null, null, null, null, "111-ITEM DA COLA", 10],
      // Novo depto sem nenhuma seção/grupo/subgrupo declarada abaixo dele:
      // o produto seguinte não pode herdar BEBIDAS/REFRIGERANTES/COLA.
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

  it("reseta só grupo/subgrupo ao entrar numa nova seção, mantendo o depto", () => {
    const buf = makeWorkbook([
      [null, null, null, null, null, "001 - CENTRO"],
      ["DTA_VENDA é 01/07/2024"],
      ["MERCEARIA", "Total"],
      [null, "BEBIDAS", "Total"],
      [null, null, "REFRIGERANTES", "Total"],
      [null, null, null, "COLA", "Total"],
      [null, null, null, null, "111-ITEM DA COLA", 10],
      // Nova seção do MESMO depto: grupo/subgrupo da seção anterior não
      // podem vazar pro item desta seção nova.
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
    // grupo/subgrupo devem sair NULL, nunca "" nem 0.
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

  it("lê corretamente um arquivo .xls legado (binário BIFF8), não só .xlsx", () => {
    // O dropzone aceita a extensão (upload-dropzone.tsx: accept=".xlsx,.xls"),
    // mas nada testava esse formato: parseAnyWorkbook usa o mesmo XLSX.read()
    // pros dois, que detecta o formato pelo conteúdo do buffer, não pela
    // extensão do nome de arquivo (que o parser nem recebe).
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

  it("preserva acentos e emoji em nome de loja/produto sem corromper", () => {
    const buf = makeWorkbook([
      [null, null, null, null, null, "001 - AÇAÍ 🎉 SHOPPING"],
      ["DTA_VENDA é 01/01/2024"],
      [null, null, null, null, "12345-PÃO DE AÇÚCAR ñoño 日本語", 10],
    ]);
    const result = parseAnyWorkbook(buf);
    expect(result.stores[0].store_name).toBe("AÇAÍ 🎉 SHOPPING");
    expect(result.products[0].prod_name).toBe("PÃO DE AÇÚCAR ñoño 日本語");
  });

  it("lê só a primeira planilha quando o arquivo tem múltiplas abas", () => {
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

  it("não funde linhas duplicadas do mesmo produto/loja, cada linha vira uma venda", () => {
    // finalize_import (migrate-schema.sql) que soma via GROUP BY/SUM no
    // banco; o parser em si não deduplica nem funde nada, só repassa cada
    // linha como uma venda separada.
    const buf = makeWorkbook([
      [null, null, null, null, null, "001 - CENTRO"],
      ["DTA_VENDA é 01/01/2024"],
      [null, null, null, null, "111-PROD DUPLICADO", 10],
      [null, null, null, null, "111-PROD DUPLICADO", 25],
    ]);
    const result = parseAnyWorkbook(buf);
    expect(result.sales).toHaveLength(2);
    expect(result.sales.map((s) => s.val_vda)).toEqual([10, 25]);
    // productMap é um Map por código: a segunda ocorrência não duplica a
    // entrada, só "ganha" se o nome mudar (não muda aqui).
    expect(result.products).toHaveLength(1);
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
