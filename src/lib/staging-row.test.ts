import { describe, it, expect } from "vitest";
import { STAGING_COLS, stagingCellDefault, toStagingRow } from "./staging-row";

const idx = (col: string) => STAGING_COLS.indexOf(col as (typeof STAGING_COLS)[number]);

describe("staging-row", () => {
  it("mantém categorias nulas como NULL (não vira 0)", () => {
    // Regressão do bug do import via CLI: depto/secao/grupo/subgrupo nulos
    // caíam em `?? 0` e viravam a string "0" no VARCHAR.
    const row = {
      store_code: "001",
      store_name: "CENTRO",
      prod_code: "12345",
      prod_name: "PROD X",
      depto: "MERCEARIA",
      secao: null,
      grupo: null,
      subgrupo: null,
      val_vda: 100.5,
    };
    const out = toStagingRow(row, "batch-1", "2024-03-15");

    expect(out[idx("secao")]).toBeNull();
    expect(out[idx("grupo")]).toBeNull();
    expect(out[idx("subgrupo")]).toBeNull();
    expect(out[idx("depto")]).toBe("MERCEARIA");
    // Garante que não é o número/string 0.
    expect(out[idx("subgrupo")]).not.toBe(0);
    expect(out[idx("subgrupo")]).not.toBe("0");
  });

  it("preenche colunas numéricas ausentes com 0", () => {
    const row = { store_code: "001", prod_code: "1", val_vda: 10 };
    const out = toStagingRow(row, "batch-1", "2024-03-15");

    expect(out[idx("qty_vda")]).toBe(0);
    expect(out[idx("val_cus")]).toBe(0);
    expect(out[idx("per_mrg")]).toBe(0);
    expect(out[idx("val_vda")]).toBe(10);
  });

  it("injeta sale_date e batch_id nas posições certas", () => {
    const out = toStagingRow({}, "batch-xyz", "2024-06-10");
    expect(out[idx("sale_date")]).toBe("2024-06-10");
    expect(out[idx("batch_id")]).toBe("batch-xyz");
  });

  it("preserva valor 0 explícito da origem", () => {
    // `?? default` só troca null/undefined — um 0 de verdade passa direto.
    const out = toStagingRow({ val_dev: 0 }, "b", "2024-01-01");
    expect(out[idx("val_dev")]).toBe(0);
  });

  it("stagingCellDefault: numéricas -> 0, texto -> null", () => {
    expect(stagingCellDefault("val_vda")).toBe(0);
    expect(stagingCellDefault("qty_sld")).toBe(0);
    expect(stagingCellDefault("per_mrg")).toBe(0);
    expect(stagingCellDefault("depto")).toBeNull();
    expect(stagingCellDefault("subgrupo")).toBeNull();
    expect(stagingCellDefault("store_name")).toBeNull();
  });
});
