import { describe, it, expect } from "vitest";
import { cascadePatch, computeAreaCascadeOptions, type HierarchyItem } from "./filter-cascade";

describe("cascadePatch", () => {
  it("zera todos os níveis abaixo de stores", () => {
    expect(cascadePatch("stores", ["1516"])).toEqual({
      stores: ["1516"],
      deptos: [],
      secoes: [],
      grupos: [],
      subgrupos: [],
    });
  });

  it("zera apenas os níveis abaixo de secoes, preservando stores/deptos fora do patch", () => {
    expect(cascadePatch("secoes", ["MERCEARIA SECA"])).toEqual({
      secoes: ["MERCEARIA SECA"],
      grupos: [],
      subgrupos: [],
    });
  });

  it("não zera nada abaixo de subgrupos, o último nível", () => {
    expect(cascadePatch("subgrupos", ["ARROZ"])).toEqual({ subgrupos: ["ARROZ"] });
  });

  it("zera com array vazio quando o valor setado também é vazio (limpar seleção)", () => {
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

  it("dedup as lojas por store_code sem filtro nenhum", () => {
    const { stores } = computeAreaCascadeOptions(hierarchy, noFilters);
    expect(stores.map((s) => s.store_code)).toEqual(["1516", "1629", "5287"]);
  });

  it("sem filtro, opções de cada nível vêm da hierarquia inteira", () => {
    const r = computeAreaCascadeOptions(hierarchy, noFilters);
    expect(r.deptosOpts).toEqual(["BAZAR", "MERCEARIA"]);
    expect(r.secoesOpts.sort()).toEqual(["BEBIDAS", "SECA", "UTILIDADES"]);
  });

  it("filtrar por loja restringe as opções de depto/secao/grupo/subgrupo ao subconjunto dela", () => {
    const r = computeAreaCascadeOptions(hierarchy, { ...noFilters, fStores: ["1516"] });
    expect(r.deptosOpts).toEqual(["MERCEARIA"]);
    expect(r.gruposOpts).toEqual(["ARROZ", "FEIJAO"]);
  });

  it("filtrar por depto não elimina outras lojas do mesmo depto (stores não depende de fDeptos)", () => {
    // MERCEARIA exists in both 1516 and 5287: the filter is hierarchical downward, not upward.
    const r = computeAreaCascadeOptions(hierarchy, { ...noFilters, fDeptos: ["MERCEARIA"] });
    expect(r.stores.map((s) => s.store_code)).toEqual(["1516", "1629", "5287"]);
    expect(r.secoesOpts.sort()).toEqual(["BEBIDAS", "SECA"]);
  });

  it("cascata completa: loja + depto + secao restringe grupo/subgrupo ao caminho exato", () => {
    const r = computeAreaCascadeOptions(hierarchy, {
      fStores: ["1516"],
      fDeptos: ["MERCEARIA"],
      fSecoes: ["SECA"],
      fGrupos: [],
    });
    expect(r.gruposOpts).toEqual(["ARROZ", "FEIJAO"]);
    expect(r.subgruposOpts).toEqual(["ARROZ BRANCO", "FEIJAO CARIOCA"]);
  });

  it("filtrar por grupo restringe subgrupo ao grupo selecionado", () => {
    const r = computeAreaCascadeOptions(hierarchy, { ...noFilters, fGrupos: ["ARROZ"] });
    expect(r.subgruposOpts).toEqual(["ARROZ BRANCO"]);
  });

  it("filtro que não bate com nada devolve listas vazias, não erro", () => {
    const r = computeAreaCascadeOptions(hierarchy, { ...noFilters, fStores: ["9999"] });
    expect(r.deptosOpts).toEqual([]);
    expect(r.secoesOpts).toEqual([]);
    expect(r.gruposOpts).toEqual([]);
    expect(r.subgruposOpts).toEqual([]);
  });

  it("subgrupo null na hierarquia não vira a string 'null' nem quebra o filtro/sort", () => {
    const r = computeAreaCascadeOptions(hierarchy, { ...noFilters, fStores: ["1629"] });
    expect(r.subgruposOpts).toEqual([]);
  });

  it("hierarquia vazia devolve tudo vazio", () => {
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
