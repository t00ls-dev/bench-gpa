import type { SavedAreaProductHierarchy } from "@/lib/saved-area-analyses.functions";

export interface SavedAreaHierarchyFilters {
  deptos: string[];
  secoes: string[];
  grupos: string[];
  subgrupos: string[];
}

const LEVELS = ["deptos", "secoes", "grupos", "subgrupos"] as const;
const PRODUCT_FIELDS = ["depto", "secao", "grupo", "subgrupo"] as const;

export function restoreSavedAreaHierarchyFilters(
  products: SavedAreaProductHierarchy[],
): SavedAreaHierarchyFilters {
  const filters: SavedAreaHierarchyFilters = {
    deptos: [],
    secoes: [],
    grupos: [],
    subgrupos: [],
  };
  if (products.length === 0) return filters;

  for (let index = 0; index < LEVELS.length; index += 1) {
    const field = PRODUCT_FIELDS[index];
    const values = products.map((product) => product[field]);
    const completeValues = values.filter((value): value is string => Boolean(value));
    if (completeValues.length !== products.length) break;
    filters[LEVELS[index]] = [...new Set(completeValues)].sort();
  }

  return filters;
}
