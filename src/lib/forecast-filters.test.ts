import { describe, expect, it } from "vitest";
import type { ProductionForecastProduct, ProductionSecaoForecast } from "@/lib/api-types";
import {
  applyForecastSearch,
  forecastProductsForSubgroups,
  setForecastStore,
  setForecastTargetDate,
  type ForecastFilters,
} from "./forecast-filters";

const restoredFilters: ForecastFilters = {
  storeCode: "1516",
  targetDate: "2026-08-24",
  secao: "ACOUGUE",
  grupos: ["BOVINOS"],
  subgrupos: ["CORTES NOBRES"],
  productFilter: ["123"],
};

function product(prodCode: string, subgrupo: string | null): ProductionForecastProduct {
  return {
    prodCode,
    prodName: `Produto ${prodCode}`,
    secao: "ACOUGUE",
    grupo: "BOVINOS",
    subgrupo,
    occurrences: 8,
    forecastVal: 100,
    forecastMin: 80,
    forecastMax: 120,
  };
}

describe("Forecast filter hierarchy", () => {
  it("clears hierarchy descendants when the store changes", () => {
    expect(setForecastStore(restoredFilters, "1629")).toEqual({
      storeCode: "1629",
      targetDate: "2026-08-24",
      secao: undefined,
      grupos: [],
      subgrupos: [],
      productFilter: [],
    });
  });

  it("applies a deep-link store through the same store hierarchy semantics", () => {
    expect(applyForecastSearch(restoredFilters, { store: "1629" })).toEqual({
      storeCode: "1629",
      targetDate: "2026-08-24",
      secao: undefined,
      grupos: [],
      subgrupos: [],
      productFilter: [],
    });
  });

  it("preserves restored hierarchy values when the deep-link store is unchanged", () => {
    expect(applyForecastSearch(restoredFilters, { store: "1516" })).toBe(restoredFilters);
  });

  it("preserves selected filters when the target date changes", () => {
    expect(setForecastTargetDate(restoredFilters, "2026-08-25")).toEqual({
      ...restoredFilters,
      targetDate: "2026-08-25",
    });
  });

  it("only replaces fields present in a target-date-only deep link", () => {
    expect(applyForecastSearch(restoredFilters, { targetDate: "2026-08-25" })).toEqual({
      ...restoredFilters,
      targetDate: "2026-08-25",
    });
  });

  it("restricts products to the selected subgroups", () => {
    const secoes: ProductionSecaoForecast[] = [
      {
        secao: "ACOUGUE",
        produtos: [product("123", "CORTES NOBRES"), product("456", "CORTES DO DIANTEIRO")],
        totalSecao: 200,
      },
      {
        secao: "PEIXARIA",
        produtos: [product("789", null)],
        totalSecao: 100,
      },
    ];

    expect(forecastProductsForSubgroups(secoes, ["CORTES NOBRES"]).map((p) => p.prodCode)).toEqual([
      "123",
    ]);
    expect(forecastProductsForSubgroups(secoes, [])).toHaveLength(3);
  });
});
