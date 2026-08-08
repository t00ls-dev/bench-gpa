import { describe, it, expect } from "vitest";
import { computeVisibleSecoes } from "./production-filter";
import type { ProductionSecaoForecast } from "@/lib/api-types";

const VAL_INDIVIDUAL = 500;
const VAL_OUTROS = 90;
const VAL_TOTAL_SUBGRUPO = VAL_INDIVIDUAL + VAL_OUTROS;

const SECOES: ProductionSecaoForecast[] = [
  {
    secao: "CARNES E AVES",
    grupos: [
      {
        grupo: "BOVINOS",
        subgrupos: [
          {
            subgrupo: "CORTES NOBRES",
            produtos: [
              {
                prodCode: "1",
                prodName: "PICANHA",
                secao: "CARNES E AVES",
                grupo: "BOVINOS",
                subgrupo: "CORTES NOBRES",
                occurrences: 6,
                forecastVal: VAL_INDIVIDUAL,
                forecastMin: 380,
                forecastMax: 610,
              },
            ],
            outros: { numProdutos: 3, outrosVal: VAL_OUTROS },
            totalSubgrupo: VAL_TOTAL_SUBGRUPO,
          },
        ],
        totalGrupo: VAL_TOTAL_SUBGRUPO,
      },
    ],
    totalSecao: VAL_TOTAL_SUBGRUPO,
  },
  {
    secao: "BACALHAU",
    grupos: [],
    totalSecao: 0,
  },
];

describe("computeVisibleSecoes", () => {
  it("returns every seção unchanged when there's no productFilter", () => {
    const { visibleSecoes, totalGeral } = computeVisibleSecoes(SECOES);
    expect(visibleSecoes).toEqual(SECOES);
    expect(totalGeral).toBe(VAL_TOTAL_SUBGRUPO);
  });

  it("returns every seção unchanged when productFilter is empty", () => {
    const { visibleSecoes, totalGeral } = computeVisibleSecoes(SECOES, []);
    expect(visibleSecoes).toEqual(SECOES);
    expect(totalGeral).toBe(VAL_TOTAL_SUBGRUPO);
  });

  it("narrows to the selected PLUs and drops branches with nothing left, at every level", () => {
    const { visibleSecoes, totalGeral } = computeVisibleSecoes(SECOES, ["1"]);
    expect(visibleSecoes).toHaveLength(1);
    expect(visibleSecoes[0].secao).toBe("CARNES E AVES");
    expect(visibleSecoes[0].grupos).toHaveLength(1);
    expect(visibleSecoes[0].grupos[0].subgrupos).toHaveLength(1);
    expect(visibleSecoes[0].grupos[0].subgrupos[0].produtos).toHaveLength(1);
    expect(totalGeral).toBe(VAL_INDIVIDUAL);
  });

  it("excludes outros while a productFilter is active and recomputes totals at every level", () => {
    const { visibleSecoes } = computeVisibleSecoes(SECOES, ["1"]);
    const subgrupo = visibleSecoes[0].grupos[0].subgrupos[0];
    expect(subgrupo.outros).toBeNull();
    expect(subgrupo.totalSubgrupo).toBe(VAL_INDIVIDUAL);
    expect(visibleSecoes[0].grupos[0].totalGrupo).toBe(VAL_INDIVIDUAL);
    expect(visibleSecoes[0].totalSecao).toBe(VAL_INDIVIDUAL);
  });

  it("returns an empty list when the filter matches nothing", () => {
    const { visibleSecoes, totalGeral } = computeVisibleSecoes(SECOES, ["nada-aqui"]);
    expect(visibleSecoes).toHaveLength(0);
    expect(totalGeral).toBe(0);
  });
});
