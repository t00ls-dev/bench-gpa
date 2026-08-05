import { describe, it, expect } from "vitest";
import { STAGING_COLS, stagingCellDefault, toStagingRow } from "./staging-row";

const idx = (col: string) => STAGING_COLS.indexOf(col as (typeof STAGING_COLS)[number]);

describe("staging-row", () => {
  it("mantém categorias nulas como NULL (não vira 0)", () => {
    // Regression from the CLI import bug: null depto/secao/grupo/subgrupo
    // fell into `?? 0` and became the string "0" in the VARCHAR.
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
    // Ensures it isn't the number/string 0.
    expect(out[idx("subgrupo")]).not.toBe(0);
    expect(out[idx("subgrupo")]).not.toBe("0");
  });

  it("preenche val_vda ausente com 0, não com null", () => {
    const out = toStagingRow({ store_code: "001", prod_code: "1" }, "batch-1", "2024-03-15");
    expect(out[idx("val_vda")]).toBe(0);
  });

  it("injeta sale_date e batch_id nas posições certas", () => {
    const out = toStagingRow({}, "batch-xyz", "2024-06-10");
    expect(out[idx("sale_date")]).toBe("2024-06-10");
    expect(out[idx("batch_id")]).toBe("batch-xyz");
  });

  it("preserva valor 0 explícito da origem", () => {
    // `?? default` only replaces null/undefined: a real 0 passes straight through.
    const out = toStagingRow({ val_vda: 0 }, "b", "2024-01-01");
    expect(out[idx("val_vda")]).toBe(0);
  });

  it("stagingCellDefault: val_vda -> 0, texto -> null", () => {
    expect(stagingCellDefault("val_vda")).toBe(0);
    expect(stagingCellDefault("depto")).toBeNull();
    expect(stagingCellDefault("subgrupo")).toBeNull();
    expect(stagingCellDefault("store_name")).toBeNull();
  });

  it("val_vda é a única medida no layout", () => {
    // GPA's export only brings VAL_VDA (verified across the 68 spreadsheets in data/).
    // If someone reintroduces qty/cost/margin here without the parser filling
    // them in, this test fails and forces a check of the export first.
    const measures = STAGING_COLS.filter((c) => /^(val|qty|per)_/.test(c));
    expect(measures).toEqual(["val_vda"]);
  });
});
