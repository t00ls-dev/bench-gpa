import { describe, it, expect } from "vitest";
import { computeVisibleSecoes, mergeOutros } from "./production-filter";
import type { ProductionForecastProduct, ProductionSecaoForecast } from "@/lib/api-types";

function produto(overrides: Partial<ProductionForecastProduct> = {}): ProductionForecastProduct {
  return {
    prodCode: "1",
    prodName: "PICANHA",
    secao: "CARNES E AVES",
    grupo: "BOVINOS",
    subgrupo: "CORTES NOBRES",
    occurrences: 6,
    forecastVal: 500,
    forecastMin: 380,
    forecastMax: 610,
    ...overrides,
  };
}

const SECOES: ProductionSecaoForecast[] = [
  {
    secao: "CARNES E AVES",
    produtos: [
      produto(),
      produto({
        prodCode: "2",
        prodName: "FRANGO",
        grupo: "AVES",
        subgrupo: "CONGELADOS",
        forecastVal: 200,
        forecastMin: 150,
        forecastMax: 260,
      }),
    ],
    outrosBySubgrupo: [
      { grupo: "BOVINOS", subgrupo: "CORTES NOBRES", numProdutos: 3, outrosVal: 90 },
      { grupo: "AVES", subgrupo: "CONGELADOS", numProdutos: 2, outrosVal: 50 },
    ],
    totalSecao: 840,
  },
  {
    secao: "BACALHAU",
    produtos: [],
    outrosBySubgrupo: [],
    totalSecao: 0,
  },
];

describe("computeVisibleSecoes", () => {
  it("returns every seção unchanged when no filter is active", () => {
    const { visibleSecoes, totalGeral } = computeVisibleSecoes(SECOES);
    expect(visibleSecoes).toEqual(SECOES);
    expect(totalGeral).toBe(840);
  });

  it("returns every seção unchanged when filters are empty arrays", () => {
    const { visibleSecoes, totalGeral } = computeVisibleSecoes(SECOES, [], []);
    expect(visibleSecoes).toEqual(SECOES);
    expect(totalGeral).toBe(840);
  });

  it("productFilter: narrows to the selected PLUs, drops every outros bucket, recomputes the total", () => {
    const { visibleSecoes, totalGeral } = computeVisibleSecoes(SECOES, ["1"]);
    expect(visibleSecoes).toHaveLength(1);
    expect(visibleSecoes[0].produtos.map((p) => p.prodCode)).toEqual(["1"]);
    expect(visibleSecoes[0].outrosBySubgrupo).toEqual([]);
    expect(totalGeral).toBe(500);
  });

  it("subgrupoFilter: narrows to the selected subgrupo's products AND its outros bucket", () => {
    const { visibleSecoes, totalGeral } = computeVisibleSecoes(SECOES, undefined, [
      "CORTES NOBRES",
    ]);
    expect(visibleSecoes).toHaveLength(1);
    expect(visibleSecoes[0].produtos.map((p) => p.prodCode)).toEqual(["1"]);
    expect(visibleSecoes[0].outrosBySubgrupo).toEqual([
      { grupo: "BOVINOS", subgrupo: "CORTES NOBRES", numProdutos: 3, outrosVal: 90 },
    ]);
    expect(totalGeral).toBe(590);
  });

  it("combines subgrupoFilter and productFilter", () => {
    const { visibleSecoes, totalGeral } = computeVisibleSecoes(SECOES, ["1"], ["CORTES NOBRES"]);
    expect(visibleSecoes).toHaveLength(1);
    expect(visibleSecoes[0].produtos.map((p) => p.prodCode)).toEqual(["1"]);
    expect(visibleSecoes[0].outrosBySubgrupo).toEqual([]);
    expect(totalGeral).toBe(500);
  });

  it("returns an empty list when the filter matches nothing", () => {
    const { visibleSecoes, totalGeral } = computeVisibleSecoes(SECOES, ["nada-aqui"]);
    expect(visibleSecoes).toHaveLength(0);
    expect(totalGeral).toBe(0);
  });
});

describe("mergeOutros", () => {
  it("sums every outros bucket for a seção into one aggregate", () => {
    expect(mergeOutros(SECOES[0].outrosBySubgrupo)).toEqual({ numProdutos: 5, outrosVal: 140 });
  });

  it("returns null when there are no outros buckets", () => {
    expect(mergeOutros([])).toBeNull();
  });
});
