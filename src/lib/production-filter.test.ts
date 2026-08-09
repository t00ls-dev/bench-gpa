import { describe, it, expect } from "vitest";
import { computeVisibleSecoes } from "./production-filter";
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
    totalSecao: 700,
  },
  {
    secao: "BACALHAU",
    produtos: [],
    totalSecao: 0,
  },
];

describe("computeVisibleSecoes", () => {
  it("returns every seção unchanged when no filter is active", () => {
    const { visibleSecoes, totalGeral } = computeVisibleSecoes(SECOES);
    expect(visibleSecoes).toEqual(SECOES);
    expect(totalGeral).toBe(700);
  });

  it("returns every seção unchanged when filters are empty arrays", () => {
    const { visibleSecoes, totalGeral } = computeVisibleSecoes(SECOES, [], []);
    expect(visibleSecoes).toEqual(SECOES);
    expect(totalGeral).toBe(700);
  });

  it("productFilter: narrows to the selected PLUs and recomputes the total", () => {
    const { visibleSecoes, totalGeral } = computeVisibleSecoes(SECOES, ["1"]);
    expect(visibleSecoes).toHaveLength(1);
    expect(visibleSecoes[0].produtos.map((p) => p.prodCode)).toEqual(["1"]);
    expect(totalGeral).toBe(500);
  });

  it("subgrupoFilter: narrows to the selected subgrupo's products", () => {
    const { visibleSecoes, totalGeral } = computeVisibleSecoes(SECOES, undefined, [
      "CORTES NOBRES",
    ]);
    expect(visibleSecoes).toHaveLength(1);
    expect(visibleSecoes[0].produtos.map((p) => p.prodCode)).toEqual(["1"]);
    expect(totalGeral).toBe(500);
  });

  it("combines subgrupoFilter and productFilter", () => {
    const { visibleSecoes, totalGeral } = computeVisibleSecoes(
      SECOES,
      ["1", "2"],
      ["CORTES NOBRES"],
    );
    expect(visibleSecoes).toHaveLength(1);
    expect(visibleSecoes[0].produtos.map((p) => p.prodCode)).toEqual(["1"]);
    expect(totalGeral).toBe(500);
  });

  it("returns an empty list when the filter matches nothing", () => {
    const { visibleSecoes, totalGeral } = computeVisibleSecoes(SECOES, ["nada-aqui"]);
    expect(visibleSecoes).toHaveLength(0);
    expect(totalGeral).toBe(0);
  });
});
