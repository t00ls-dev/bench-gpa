import { describe, expect, it } from "vitest";
import { restoreSavedAreaHierarchyFilters } from "./saved-area-filter-restoration";

describe("restoreSavedAreaHierarchyFilters", () => {
  it("restores every distinct current hierarchy value for mixed products", () => {
    expect(
      restoreSavedAreaHierarchyFilters([
        {
          productCode: "100",
          depto: "PERECIVEIS",
          secao: "PADARIA",
          grupo: "PAES",
          subgrupo: "FRANCES",
        },
        {
          productCode: "200",
          depto: "MERCEARIA",
          secao: "BEBIDAS",
          grupo: "REFRIGERANTES",
          subgrupo: "COLA",
        },
      ]),
    ).toEqual({
      deptos: ["MERCEARIA", "PERECIVEIS"],
      secoes: ["BEBIDAS", "PADARIA"],
      grupos: ["PAES", "REFRIGERANTES"],
      subgrupos: ["COLA", "FRANCES"],
    });
  });

  it("stops at the first incomplete level instead of hiding a saved product", () => {
    expect(
      restoreSavedAreaHierarchyFilters([
        {
          productCode: "100",
          depto: "PERECIVEIS",
          secao: "PADARIA",
          grupo: "PAES",
          subgrupo: "FRANCES",
        },
        {
          productCode: "200",
          depto: "PERECIVEIS",
          secao: null,
          grupo: null,
          subgrupo: null,
        },
      ]),
    ).toEqual({
      deptos: ["PERECIVEIS"],
      secoes: [],
      grupos: [],
      subgrupos: [],
    });
  });
});
