import type { SupabaseClient } from "@supabase/supabase-js";
import { safeError } from "./safe-error";
import type { Database } from "@/integrations/supabase/types";
import { FilterSchema } from "./schemas";
import type { Filters } from "./schemas";

export type DB = SupabaseClient<Database>;

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
  return String(v ?? "");
}
export function strOrNull(v: unknown): string | null {
  return v == null ? null : String(v);
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

export async function callMetrics(supabase: DB, f: Filters): Promise<DashboardMetricsResult> {
  const { cache } = await import("./cache");
  const key = metricsCacheKey(f);
  return cache.wrap(key, async () => {
    const { data, error } = await supabase.rpc("dashboard_metrics", {
      p_date_from: f.dateFrom || (null as unknown as string),
      p_date_to: f.dateTo || (null as unknown as string),
      p_stores: f.stores ?? [],
      p_deptos: f.deptos ?? [],
      p_secoes: f.secoes ?? [],
      p_grupos: f.grupos ?? [],
      p_subgrupos: f.subgrupos ?? [],
    });
    if (error) throw safeError("analytics", error);
    const d = asRecord(data);
    return {
      total: num(d.total),
      byStore: parseCodeNameVal(d.byStore),
      byDepto: parseNameVal(d.byDepto),
      byDate: parseDateVal(d.byDate),
    };
  });
}
