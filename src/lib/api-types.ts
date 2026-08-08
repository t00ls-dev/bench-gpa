import type { Filters } from "./schemas";
import db from "./db";
import { CACHE_TTL_SHORT } from "./cache";

export interface NameVal {
  name: string;
  val: number;
}
export interface CodeNameVal {
  code: string;
  name: string;
  val: number;
}
export interface DateVal {
  date: string;
  val: number;
}

export interface DashboardMetricsResult {
  total: number;
  byStore: CodeNameVal[];
  byDepto: NameVal[];
  byDate: DateVal[];
}

export interface StoreOption {
  store_code: string;
  store_name: string;
}
export interface FilterOptionsResult {
  latestDate: string | null;
  stores: StoreOption[];
  deptos: string[];
  secoes: string[];
  grupos: string[];
  subgrupos: string[];
  availableDates: string[];
}

export interface DashboardRankingsResult {
  byDepto: NameVal[];
  bySecao: NameVal[];
  byGrupo: NameVal[];
  bySubgrupo: NameVal[];
  byProduto: Array<{ code: string; name: string; val: number }>;
}

export interface AreaProduct {
  prod_code: string;
  prod_name: string;
  depto: string | null;
  secao: string | null;
  grupo: string | null;
  subgrupo: string | null;
  val: number;
  lastSaleDate: string | null;
}
export interface AreaAnalysisResult {
  total: number;
  plusTotal: number;
  plusWithSale: number;
  plusWithoutSale: number;
  avgPerPlu: number;
  products: AreaProduct[];
  byDate: DateVal[];
  totalProducts?: number;
  page?: number;
  pageSize?: number;
  totalPages?: number;
}

export interface AreaHierarchyItem {
  store_code: string;
  store_name: string;
  depto: string | null;
  secao: string | null;
  grupo: string | null;
  subgrupo: string | null;
}
export interface AreaFilterHierarchyResult {
  latestDate: string | null;
  hierarchy: AreaHierarchyItem[];
  availableDates: string[];
}

export interface ProductionForecastProduct {
  prodCode: string;
  prodName: string;
  secao: string | null;
  grupo: string | null;
  subgrupo: string | null;
  occurrences: number;
  forecastVal: number;
  forecastMin: number;
  forecastMax: number;
}
/** Aggregate for products below PRODUCTION_MIN_OCCURRENCES within one
 * (secao, grupo, subgrupo) -- no individual PLU/min/max, see
 * OUTROS_CAVEAT_TEXT (src/lib/production-filter.ts) for why. */
export interface ProductionOutrosAggregate {
  numProdutos: number;
  outrosVal: number;
}
export interface ProductionSubgrupoForecast {
  /** null = "Sem subgrupo" (nullable in sales_prod_daily_agg/product_universe). */
  subgrupo: string | null;
  produtos: ProductionForecastProduct[];
  outros: ProductionOutrosAggregate | null;
  totalSubgrupo: number;
}
export interface ProductionGrupoForecast {
  /** null = "Sem grupo". */
  grupo: string | null;
  subgrupos: ProductionSubgrupoForecast[];
  totalGrupo: number;
}
export interface ProductionSecaoForecast {
  secao: string;
  // [] when the seção had nothing this weekday -- it still shows (built
  // from product_universe's full catalog, see production.functions.ts),
  // just with an empty tree. Grupo/Subgrupo, unlike Seção, only exist here
  // when they actually have data: nothing pads them from the catalog.
  grupos: ProductionGrupoForecast[];
  totalSecao: number;
}
export interface ProductionForecastResult {
  secoes: ProductionSecaoForecast[];
  weekdayNum: number;
  minOccurrences: number;
  lookbackOccurrences: number;
}

/** One row per (secao, grupo) pair that exists in PERECIVEIS at a store --
 * used to build the Seção/Grupo filter cascade client-side, same spirit
 * as AreaHierarchyItem but scoped to just these 2 levels. */
export interface ProductionFilterOption {
  secao: string;
  grupo: string | null;
}

export interface ProductAnalysisResult {
  product: {
    prod_code: string;
    prod_name: string;
    depto: string | null;
    secao: string | null;
    grupo: string | null;
    subgrupo: string | null;
  } | null;
  refDate: string | null;
  refValue: number;
  byStore: CodeNameVal[];
  evolution: DateVal[];
  lastFourSameWeekday: DateVal[];
  lastFourAll: DateVal[];
}

export function asRecord(v: unknown): Record<string, unknown> {
  return (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
}
export function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}
export function num(v: unknown): number {
  return Number(v ?? 0);
}
export function str(v: unknown): string {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v ?? "");
}
export function strOrNull(v: unknown): string | null {
  if (v == null) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v);
}
// Unlike str()/strOrNull(), keeps the time-of-day. Use for TIMESTAMP/DATETIME
// columns (e.g. imported_at), not DATE-only columns (e.g. sale_date).
export function dateTimeStr(v: unknown): string {
  if (v instanceof Date) return v.toISOString();
  return String(v ?? "");
}
export function numOrNull(v: unknown): number | null {
  return v == null ? null : Number(v);
}

export function parseNameVal(xs: unknown): NameVal[] {
  return asArray(xs).map((x) => {
    const r = asRecord(x);
    return { name: str(r.name), val: num(r.val) };
  });
}
export function parseCodeNameVal(xs: unknown): CodeNameVal[] {
  return asArray(xs).map((x) => {
    const r = asRecord(x);
    return { code: str(r.code), name: str(r.name), val: num(r.val) };
  });
}
export function parseDateVal(xs: unknown): DateVal[] {
  return asArray(xs).map((x) => {
    const r = asRecord(x);
    return { date: str(r.date), val: num(r.val) };
  });
}

function metricsCacheKey(f: Filters): string {
  return `metrics:${f.dateFrom ?? ""}:${f.dateTo ?? ""}:${(f.stores ?? []).join(",")}:${(f.deptos ?? []).join(",")}:${(f.secoes ?? []).join(",")}:${(f.grupos ?? []).join(",")}:${(f.subgrupos ?? []).join(",")}`;
}

export async function callMetrics(f: Filters): Promise<DashboardMetricsResult> {
  const { cache } = await import("./cache");
  const key = metricsCacheKey(f);
  return cache.wrap(
    key,
    async () => {
      const [rs] = await db.query("CALL dashboard_metrics(?, ?, ?, ?, ?, ?, ?)", [
        f.dateFrom || null,
        f.dateTo || null,
        JSON.stringify(f.stores ?? []),
        JSON.stringify(f.deptos ?? []),
        JSON.stringify(f.secoes ?? []),
        JSON.stringify(f.grupos ?? []),
        JSON.stringify(f.subgrupos ?? []),
      ]);
      const [aggregate, byStore, byDepto, byDate] = rs as unknown[];
      return {
        total: num(asRecord(asArray(aggregate)[0]).total),
        byStore: parseCodeNameVal(byStore),
        byDepto: parseNameVal(byDepto),
        byDate: parseDateVal(byDate),
      };
    },
    CACHE_TTL_SHORT,
  );
}
