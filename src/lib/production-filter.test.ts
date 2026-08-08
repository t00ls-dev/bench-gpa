import { describe, it, expect } from "vitest";
import { computeVisibleSecoes } from "./production-filter";
import type { ProductionSecaoForecast } from "@/lib/api-types";

const VAL_INDIVIDUAL = 500;
const VAL_OUTROS = 90;
const VAL_TOTAL_SECAO = VAL_INDIVIDUAL + VAL_OUTROS;

const SECOES: ProductionSecaoForecast[] = [
  {
    secao: "CARNES E AVES",
    produtos: [
      {
        prodCode: "1",
        prodName: "PICANHA",
        secao: "CARNES E AVES",
        occurrences: 6,
        forecastVal: VAL_INDIVIDUAL,
        forecastMin: 380,
        forecastMax: 610,
      },
    ],
    outrosVal: VAL_OUTROS,
    outrosNumProdutos: 3,
    totalSecao: VAL_TOTAL_SECAO,
  },
  {
    secao: "BACALHAU",
    produtos: [],
    outrosVal: 0,
    outrosNumProdutos: 0,
    totalSecao: 0,
  },
];

describe("computeVisibleSecoes", () => {
  it("returns every seção unchanged when there's no productFilter", () => {
    const { visibleSecoes, totalGeral } = computeVisibleSecoes(SECOES);
    expect(visibleSecoes).toEqual(SECOES);
    expect(totalGeral).toBe(VAL_TOTAL_SECAO);
  });

  it("returns every seção unchanged when productFilter is empty", () => {
    const { visibleSecoes, totalGeral } = computeVisibleSecoes(SECOES, []);
    expect(visibleSecoes).toEqual(SECOES);
    expect(totalGeral).toBe(VAL_TOTAL_SECAO);
  });

  it("narrows to the selected PLUs and drops seções with nothing left", () => {
    const { visibleSecoes, totalGeral } = computeVisibleSecoes(SECOES, ["1"]);
    expect(visibleSecoes).toHaveLength(1);
    expect(visibleSecoes[0].secao).toBe("CARNES E AVES");
    expect(visibleSecoes[0].produtos).toHaveLength(1);
    expect(totalGeral).toBe(VAL_INDIVIDUAL);
  });

  it("excludes outros while a productFilter is active and recomputes totalSecao", () => {
    const { visibleSecoes } = computeVisibleSecoes(SECOES, ["1"]);
    expect(visibleSecoes[0].outrosNumProdutos).toBe(0);
    expect(visibleSecoes[0].outrosVal).toBe(0);
    expect(visibleSecoes[0].totalSecao).toBe(VAL_INDIVIDUAL);
  });

  it("returns an empty list when the filter matches nothing", () => {
    const { visibleSecoes, totalGeral } = computeVisibleSecoes(SECOES, ["nada-aqui"]);
    expect(visibleSecoes).toHaveLength(0);
    expect(totalGeral).toBe(0);
  });
});
