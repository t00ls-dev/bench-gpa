import { safeError } from "./safe-error";
import { FilterSchema } from "./schemas";
import type { Filters } from "./schemas";
import db from "./db";

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
  qty: number;
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

export function shiftPeriod(
  from: string,
  to: string,
  mode: "prev_period" | "prev_week" | "prev_month",
) {
  const f = new Date(from + "T00:00:00Z");
  const t = new Date(to + "T00:00:00Z");
  const days = Math.round((t.getTime() - f.getTime()) / 86400000) + 1;
  let shift = days;
  if (mode === "prev_week") shift = 7;
  if (mode === "prev_month") shift = 30;
  const nf = new Date(f.getTime() - shift * 86400000);
  const nt = new Date(t.getTime() - shift * 86400000);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { dateFrom: iso(nf), dateTo: iso(nt) };
}

function metricsCacheKey(f: Filters): string {
  return `metrics:${f.dateFrom ?? ""}:${f.dateTo ?? ""}:${(f.stores ?? []).join(",")}:${(f.deptos ?? []).join(",")}:${(f.secoes ?? []).join(",")}:${(f.grupos ?? []).join(",")}:${(f.subgrupos ?? []).join(",")}`;
}

export async function callMetrics(f: Filters): Promise<DashboardMetricsResult> {
  const { cache } = await import("./cache");
  const key = metricsCacheKey(f);
  return cache.wrap(key, async () => {
    const [rs] = await db.query(
      "CALL dashboard_metrics(?, ?, ?, ?, ?, ?, ?)",
      [
        f.dateFrom || null,
        f.dateTo || null,
        JSON.stringify(f.stores ?? []),
        JSON.stringify(f.deptos ?? []),
        JSON.stringify(f.secoes ?? []),
        JSON.stringify(f.grupos ?? []),
        JSON.stringify(f.subgrupos ?? []),
      ],
    );
    const [aggregate, byStore, byDepto, byDate] = rs;
    return {
      total: Number((aggregate as any[])[0]?.total ?? 0),
      byStore: (byStore ?? []).map((r: any) => ({ code: r.code, name: r.name, val: Number(r.val) })),
      byDepto: (byDepto ?? []).map((r: any) => ({ name: r.name, val: Number(r.val) })),
      byDate: (byDate ?? []).map((r: any) => ({ date: str(r.date), val: Number(r.val) })),
    };
  });
}
