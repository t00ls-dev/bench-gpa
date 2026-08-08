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
  occurrences: number;
  forecastVal: number;
}
export interface ProductionSecaoForecast {
  secao: string;
  produtos: ProductionForecastProduct[];
  outrosVal: number;
  outrosNumProdutos: number;
  totalSecao: number;
}
export interface ProductionForecastResult {
  secoes: ProductionSecaoForecast[];
  weekdayNum: number;
  minOccurrences: number;
  lookbackOccurrences: number;
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
