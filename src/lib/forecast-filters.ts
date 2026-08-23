import type { ProductionSecaoForecast } from "@/lib/api-types";

export interface ForecastFilters {
  storeCode: string | undefined;
  targetDate: string | undefined;
  secao: string | undefined;
  grupos: string[];
  subgrupos: string[];
  productFilter: string[];
}

export interface ForecastSearchParams {
  store?: string;
  targetDate?: string;
}

export function setForecastStore(
  filters: ForecastFilters,
  storeCode: string | undefined,
): ForecastFilters {
  if (storeCode === filters.storeCode) return filters;

  return {
    ...filters,
    storeCode,
    secao: undefined,
    grupos: [],
    subgrupos: [],
    productFilter: [],
  };
}

export function setForecastTargetDate(
  filters: ForecastFilters,
  targetDate: string | undefined,
): ForecastFilters {
  if (targetDate === filters.targetDate) return filters;
  return { ...filters, targetDate };
}

export function applyForecastSearch(
  filters: ForecastFilters,
  search: ForecastSearchParams,
): ForecastFilters {
  let next = search.store === undefined ? filters : setForecastStore(filters, search.store);

  if (search.targetDate !== undefined) {
    next = setForecastTargetDate(next, search.targetDate);
  }

  return next;
}

export function forecastProductsForSubgroups(
  secoes: ProductionSecaoForecast[],
  subgrupos: string[],
) {
  const products = secoes.flatMap((secao) => secao.produtos);
  if (subgrupos.length === 0) return products;
  return products.filter(
    (product) => product.subgrupo !== null && subgrupos.includes(product.subgrupo),
  );
}
