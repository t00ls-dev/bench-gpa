import { describe, it, expect } from "vitest";
import { cascadePatch, computeAreaCascadeOptions, type HierarchyItem } from "./filter-cascade";

describe("cascadePatch", () => {
  it("zeroes out every level below stores", () => {
    expect(cascadePatch("stores", ["1516"])).toEqual({
      stores: ["1516"],
      deptos: [],
      secoes: [],
      grupos: [],
      subgrupos: [],
    });
  });

  it("zeroes out only the levels below secoes, preserving stores/deptos outside the patch", () => {
    expect(cascadePatch("secoes", ["MERCEARIA SECA"])).toEqual({
      secoes: ["MERCEARIA SECA"],
      grupos: [],
      subgrupos: [],
    });
  });

  it("zeroes out nothing below subgrupos, the last level", () => {
    expect(cascadePatch("subgrupos", ["ARROZ"])).toEqual({ subgrupos: ["ARROZ"] });
  });

  it("zeroes out with an empty array when the set value is also empty (clear selection)", () => {
    expect(cascadePatch("deptos", [])).toEqual({
      deptos: [],
      secoes: [],
      grupos: [],
      subgrupos: [],
    });
  });
});

describe("computeAreaCascadeOptions", () => {
  const hierarchy: HierarchyItem[] = [
    {
      store_code: "1516",
      store_name: "Loja Centro",
      depto: "MERCEARIA",
      secao: "SECA",
      grupo: "ARROZ",
      subgrupo: "ARROZ BRANCO",
    },
    {
      store_code: "1516",
      store_name: "Loja Centro",
      depto: "MERCEARIA",
      secao: "SECA",
      grupo: "FEIJAO",
      subgrupo: "FEIJAO CARIOCA",
    },
    {
      store_code: "1629",
      store_name: "Loja Norte",
      depto: "BAZAR",
      secao: "UTILIDADES",
      grupo: "PLASTICOS",
      subgrupo: null,
    },
    {
      store_code: "5287",
      store_name: "Loja Sul",
      depto: "MERCEARIA",
      secao: "BEBIDAS",
      grupo: "REFRIGERANTE",
      subgrupo: "REFRIGERANTE COLA",
    },
  ];

  const noFilters = { fStores: [], fDeptos: [], fSecoes: [], fGrupos: [] };

  it("dedupes stores by store_code with no filter at all", () => {
    const { stores } = computeAreaCascadeOptions(hierarchy, noFilters);
    expect(stores.map((s) => s.store_code)).toEqual(["1516", "1629", "5287"]);
  });

  it("with no filter, each level's options come from the entire hierarchy", () => {
    const r = computeAreaCascadeOptions(hierarchy, noFilters);
    expect(r.deptosOpts).toEqual(["BAZAR", "MERCEARIA"]);
    expect(r.secoesOpts.sort()).toEqual(["BEBIDAS", "SECA", "UTILIDADES"]);
  });

  it("filtering by store restricts depto/secao/grupo/subgrupo options to its subset", () => {
    const r = computeAreaCascadeOptions(hierarchy, { ...noFilters, fStores: ["1516"] });
    expect(r.deptosOpts).toEqual(["MERCEARIA"]);
    expect(r.gruposOpts).toEqual(["ARROZ", "FEIJAO"]);
  });

  it("filtering by depto does not eliminate other stores in the same depto (stores doesn't depend on fDeptos)", () => {
    // MERCEARIA exists in both 1516 and 5287: the filter is hierarchical downward, not upward.
    const r = computeAreaCascadeOptions(hierarchy, { ...noFilters, fDeptos: ["MERCEARIA"] });
    expect(r.stores.map((s) => s.store_code)).toEqual(["1516", "1629", "5287"]);
    expect(r.secoesOpts.sort()).toEqual(["BEBIDAS", "SECA"]);
  });

  it("full cascade: store + depto + secao restricts grupo/subgrupo to the exact path", () => {
    const r = computeAreaCascadeOptions(hierarchy, {
      fStores: ["1516"],
      fDeptos: ["MERCEARIA"],
      fSecoes: ["SECA"],
      fGrupos: [],
    });
    expect(r.gruposOpts).toEqual(["ARROZ", "FEIJAO"]);
    expect(r.subgruposOpts).toEqual(["ARROZ BRANCO", "FEIJAO CARIOCA"]);
  });

  it("filtering by grupo restricts subgrupo to the selected grupo", () => {
    const r = computeAreaCascadeOptions(hierarchy, { ...noFilters, fGrupos: ["ARROZ"] });
    expect(r.subgruposOpts).toEqual(["ARROZ BRANCO"]);
  });

  it("a filter matching nothing returns empty lists, not an error", () => {
    const r = computeAreaCascadeOptions(hierarchy, { ...noFilters, fStores: ["9999"] });
    expect(r.deptosOpts).toEqual([]);
    expect(r.secoesOpts).toEqual([]);
    expect(r.gruposOpts).toEqual([]);
    expect(r.subgruposOpts).toEqual([]);
  });

  it("a null subgrupo in the hierarchy doesn't become the string 'null' or break the filter/sort", () => {
    const r = computeAreaCascadeOptions(hierarchy, { ...noFilters, fStores: ["1629"] });
    expect(r.subgruposOpts).toEqual([]);
  });

  it("an empty hierarchy returns everything empty", () => {
    const r = computeAreaCascadeOptions([], noFilters);
    expect(r).toEqual({
      stores: [],
      deptosOpts: [],
      secoesOpts: [],
      gruposOpts: [],
      subgruposOpts: [],
    });
  });
});
