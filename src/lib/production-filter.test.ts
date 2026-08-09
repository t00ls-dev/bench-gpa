import { describe, it, expect } from "vitest";
import { computeVisibleSecoes, flattenSecaoRows } from "./production-filter";
import type { ProductionSecaoForecast } from "@/lib/api-types";

function produto(
  overrides: Partial<
    ProductionSecaoForecast["grupos"][number]["subgrupos"][number]["produtos"][number]
  > = {},
) {
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
    grupos: [
      {
        grupo: "BOVINOS",
        subgrupos: [
          {
            subgrupo: "CORTES NOBRES",
            produtos: [produto()],
            outros: { numProdutos: 3, outrosVal: 90 },
            totalSubgrupo: 590,
          },
        ],
        totalGrupo: 590,
      },
      {
        grupo: "AVES",
        subgrupos: [
          {
            subgrupo: "CONGELADOS",
            produtos: [
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
            outros: { numProdutos: 2, outrosVal: 50 },
            totalSubgrupo: 250,
          },
        ],
        totalGrupo: 250,
      },
    ],
    totalSecao: 840,
  },
  {
    secao: "BACALHAU",
    grupos: [],
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

  it("productFilter: narrows to the selected PLUs, drops outros, recomputes totals at every level", () => {
    const { visibleSecoes, totalGeral } = computeVisibleSecoes(SECOES, ["1"]);
    expect(visibleSecoes).toHaveLength(1);
    expect(visibleSecoes[0].grupos).toHaveLength(1);
    const subgrupo = visibleSecoes[0].grupos[0].subgrupos[0];
    expect(subgrupo.produtos.map((p) => p.prodCode)).toEqual(["1"]);
    expect(subgrupo.outros).toBeNull();
    expect(totalGeral).toBe(500);
  });

  it("subgrupoFilter: narrows to the selected subgrupo, KEEPS its outros (unlike productFilter)", () => {
    const { visibleSecoes, totalGeral } = computeVisibleSecoes(SECOES, undefined, [
      "CORTES NOBRES",
    ]);
    expect(visibleSecoes).toHaveLength(1);
    expect(visibleSecoes[0].grupos).toHaveLength(1);
    const subgrupo = visibleSecoes[0].grupos[0].subgrupos[0];
    expect(subgrupo.subgrupo).toBe("CORTES NOBRES");
    expect(subgrupo.outros).toEqual({ numProdutos: 3, outrosVal: 90 });
    expect(totalGeral).toBe(590);
  });

  it("combines subgrupoFilter and productFilter", () => {
    const { visibleSecoes, totalGeral } = computeVisibleSecoes(SECOES, ["1"], ["CORTES NOBRES"]);
    expect(visibleSecoes).toHaveLength(1);
    const subgrupo = visibleSecoes[0].grupos[0].subgrupos[0];
    expect(subgrupo.produtos.map((p) => p.prodCode)).toEqual(["1"]);
    expect(subgrupo.outros).toBeNull();
    expect(totalGeral).toBe(500);
  });

  it("returns an empty list when the filter matches nothing", () => {
    const { visibleSecoes, totalGeral } = computeVisibleSecoes(SECOES, ["nada-aqui"]);
    expect(visibleSecoes).toHaveLength(0);
    expect(totalGeral).toBe(0);
  });
});

describe("flattenSecaoRows", () => {
  it("puts products in secao/grupo/subgrupo/valor order (traversal order of the tree)", () => {
    const { produtos } = flattenSecaoRows(SECOES[0]);
    expect(produtos.map((p) => p.prodCode)).toEqual(["1", "2"]);
  });

  it("merges outros from every subgrupo into a single aggregate per seção", () => {
    const { outros } = flattenSecaoRows(SECOES[0]);
    expect(outros).toEqual({ numProdutos: 5, outrosVal: 140 });
  });

  it("returns null outros when no subgrupo has one", () => {
    const secao: ProductionSecaoForecast = {
      secao: "PADARIA",
      grupos: [
        {
          grupo: "PAES",
          subgrupos: [
            { subgrupo: "ESPECIAIS", produtos: [produto()], outros: null, totalSubgrupo: 500 },
          ],
          totalGrupo: 500,
        },
      ],
      totalSecao: 500,
    };
    expect(flattenSecaoRows(secao).outros).toBeNull();
  });

  it("returns an empty product list for a seção with no grupos", () => {
    expect(flattenSecaoRows(SECOES[1])).toEqual({ produtos: [], outros: null });
  });
});
