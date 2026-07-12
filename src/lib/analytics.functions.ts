import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { safeError } from "./safe-error";
import type { Database } from "@/integrations/supabase/types";

type DB = SupabaseClient<Database>;

const FilterSchema = z.object({
  dateFrom: z.string().optional().nullable(),
  dateTo: z.string().optional().nullable(),
  stores: z.array(z.string()).optional().default([]),
  deptos: z.array(z.string()).optional().default([]),
  secoes: z.array(z.string()).optional().default([]),
  grupos: z.array(z.string()).optional().default([]),
  subgrupos: z.array(z.string()).optional().default([]),
});

type Filters = z.infer<typeof FilterSchema>;

// ---- RPC result interfaces ----
interface NameVal {
  name: string;
  val: number;
}
interface CodeNameVal {
  code: string;
  name: string;
  val: number;
}
interface DateVal {
  date: string;
  val: number;
}

interface DashboardMetricsResult {
  total: number;
  byStore: CodeNameVal[];
  byDepto: NameVal[];
  byDate: DateVal[];
}

interface StoreOption {
  store_code: string;
  store_name: string;
}
interface FilterOptionsResult {
  latestDate: string | null;
  stores: StoreOption[];
  deptos: string[];
  secoes: string[];
  grupos: string[];
  subgrupos: string[];
  availableDates: string[];
}

interface DashboardRankingsResult {
  byDepto: NameVal[];
  bySecao: NameVal[];
  byGrupo: NameVal[];
  bySubgrupo: NameVal[];
  byProduto: Array<{ code: string; name: string; val: number }>;
}

interface AreaProduct {
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
interface AreaAnalysisResult {
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

interface AreaHierarchyItem {
  store_code: string;
  store_name: string;
  depto: string | null;
  secao: string | null;
  grupo: string | null;
  subgrupo: string | null;
}
interface AreaFilterHierarchyResult {
  latestDate: string | null;
  hierarchy: AreaHierarchyItem[];
  availableDates: string[];
}

interface ProductAnalysisResult {
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

// ---- helpers ----
function asRecord(v: unknown): Record<string, unknown> {
  return (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
}
function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}
function num(v: unknown): number {
  return Number(v ?? 0);
}
function str(v: unknown): string {
  return String(v ?? "");
}
function strOrNull(v: unknown): string | null {
  return v == null ? null : String(v);
}
function numOrNull(v: unknown): number | null {
  return v == null ? null : Number(v);
}

function parseNameVal(xs: unknown): NameVal[] {
  return asArray(xs).map((x) => {
    const r = asRecord(x);
    return { name: str(r.name), val: num(r.val) };
  });
}
function parseCodeNameVal(xs: unknown): CodeNameVal[] {
  return asArray(xs).map((x) => {
    const r = asRecord(x);
    return { code: str(r.code), name: str(r.name), val: num(r.val) };
  });
}
function parseDateVal(xs: unknown): DateVal[] {
  return asArray(xs).map((x) => {
    const r = asRecord(x);
    return { date: str(r.date), val: num(r.val) };
  });
}

function shiftPeriod(from: string, to: string, mode: "prev_period" | "prev_week" | "prev_month") {
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

async function callMetrics(supabase: DB, f: Filters): Promise<DashboardMetricsResult> {
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
}

export const getFilterOptions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        dateFrom: z.string().nullable().optional(),
        dateTo: z.string().nullable().optional(),
        stores: z.array(z.string()).optional().default([]),
        deptos: z.array(z.string()).optional().default([]),
        secoes: z.array(z.string()).optional().default([]),
        grupos: z.array(z.string()).optional().default([]),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ data, context }): Promise<FilterOptionsResult> => {
    const supabase = context.supabase as DB;
    const { data: res, error } = await supabase.rpc("filter_options", {
      p_date_from: data.dateFrom || (null as unknown as string),
      p_date_to: data.dateTo || (null as unknown as string),
      p_stores: data.stores ?? [],
      p_deptos: data.deptos ?? [],
      p_secoes: data.secoes ?? [],
      p_grupos: data.grupos ?? [],
    });
    if (error) throw safeError("analytics", error);
    const r = asRecord(res);
    return {
      latestDate: strOrNull(r.latestDate),
      stores: asArray(r.stores).map((x) => {
        const o = asRecord(x);
        return { store_code: str(o.store_code), store_name: str(o.store_name) };
      }),
      deptos: asArray(r.deptos).map(str),
      secoes: asArray(r.secoes).map(str),
      grupos: asArray(r.grupos).map(str),
      subgrupos: asArray(r.subgrupos).map(str),
      availableDates: asArray(r.availableDates).map(str),
    };
  });

export const getStores = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<StoreOption[]> => {
    const supabase = context.supabase as DB;
    const { data, error } = await supabase
      .from("stores")
      .select("store_code, store_name")
      .order("store_name", { ascending: true });
    if (error) throw safeError("analytics", error);
    return (data ?? []) as StoreOption[];
  });

export const getDashboard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    FilterSchema.extend({
      compare: z
        .enum(["prev_period", "prev_week", "prev_month", "none"])
        .optional()
        .default("prev_period"),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as DB;
    const current = await callMetrics(supabase, data);
    let previous: DashboardMetricsResult | null = null;
    if (data.compare !== "none" && data.dateFrom && data.dateTo) {
      const prev = shiftPeriod(data.dateFrom, data.dateTo, data.compare);
      previous = await callMetrics(supabase, {
        ...data,
        dateFrom: prev.dateFrom,
        dateTo: prev.dateTo,
      });
    }
    return { current, previous };
  });

export const getImportedDates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const supabase = context.supabase as DB;
    const { data, error } = await supabase.rpc("imported_dates");
    if (error) throw safeError("analytics", error);
    return (data ?? []) as { sale_date: string; row_count: number; imported_at: string }[];
  });

export const searchProducts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ q: z.string().min(3) }).parse(d))
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as DB;
    const { data: rows, error } = await supabase.rpc("product_search", { p_q: data.q.trim() });
    if (error) throw safeError("analytics", error);
    return (rows ?? []) as { prod_code: string; prod_name: string }[];
  });

export const getProductAnalysis = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        prodCode: z.string(),
        storeCode: z.string().optional().nullable(),
        referenceDate: z.string().optional().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<ProductAnalysisResult> => {
    const supabase = context.supabase as DB;
    const { data: res, error } = await supabase.rpc("product_analysis", {
      p_prod_code: data.prodCode,
      p_store_code: data.storeCode || undefined,
      p_ref_date: data.referenceDate || undefined,
    });
    if (error) throw safeError("analytics", error);
    const r = asRecord(res);
    const product =
      r.product == null
        ? null
        : (() => {
            const p = asRecord(r.product);
            return {
              prod_code: str(p.prod_code),
              prod_name: str(p.prod_name),
              depto: strOrNull(p.depto),
              secao: strOrNull(p.secao),
              grupo: strOrNull(p.grupo),
              subgrupo: strOrNull(p.subgrupo),
            };
          })();
    return {
      product,
      refDate: strOrNull(r.refDate),
      refValue: num(r.refValue),
      byStore: parseCodeNameVal(r.byStore),
      evolution: parseDateVal(r.evolution),
      lastFourSameWeekday: parseDateVal(r.lastFourSameWeekday),
      lastFourAll: parseDateVal(r.lastFourAll),
    };
  });

export const getAreaAnalysis = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        dateFrom: z.string(),
        dateTo: z.string(),
        stores: z.array(z.string()).optional().default([]),
        deptos: z.array(z.string()).optional().default([]),
        secoes: z.array(z.string()).optional().default([]),
        grupos: z.array(z.string()).optional().default([]),
        subgrupos: z.array(z.string()).optional().default([]),
        page: z.number().int().optional(),
        pageSize: z.number().int().optional().default(50),
        search: z.string().optional().default(""),
        sortBy: z.enum(["val", "prod_code", "prod_name", "daysSince"]).optional().default("val"),
        sortDir: z.enum(["asc", "desc"]).optional().default("desc"),
      })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<AreaAnalysisResult> => {
    const supabase = context.supabase as DB;
    const { data: res, error } = await supabase.rpc("area_analysis", {
      p_date_from: data.dateFrom,
      p_date_to: data.dateTo,
      p_stores: data.stores ?? [],
      p_deptos: data.deptos ?? [],
      p_secoes: data.secoes ?? [],
      p_grupos: data.grupos ?? [],
      p_subgrupos: data.subgrupos ?? [],
      p_page: data.page ?? null,
      p_page_size: data.pageSize,
      p_search: data.search,
      p_sort_by: data.sortBy,
      p_sort_dir: data.sortDir,
    });
    if (error) throw safeError("analytics", error);
    const r = asRecord(res);
    return {
      total: num(r.total),
      plusTotal: num(r.plusTotal),
      plusWithSale: num(r.plusWithSale),
      plusWithoutSale: num(r.plusWithoutSale),
      avgPerPlu: num(r.avgPerPlu),
      products: asArray(r.products).map((p) => {
        const o = asRecord(p);
        return {
          prod_code: str(o.prod_code),
          prod_name: str(o.prod_name),
          depto: strOrNull(o.depto),
          secao: strOrNull(o.secao),
          grupo: strOrNull(o.grupo),
          subgrupo: strOrNull(o.subgrupo),
          val: num(o.val),
          qty: num(o.qty),
          lastSaleDate: strOrNull(o.lastSaleDate),
        };
      }),
      byDate: parseDateVal(r.byDate),
      totalProducts: numOrNull(r.totalProducts) ?? undefined,
      page: numOrNull(r.page) ?? undefined,
      pageSize: numOrNull(r.pageSize) ?? undefined,
      totalPages: numOrNull(r.totalPages) ?? undefined,
    };
  });

export const getAreaFilterHierarchy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AreaFilterHierarchyResult> => {
    const supabase = context.supabase as DB;
    const { data: res, error } = await supabase.rpc("area_filter_hierarchy");
    if (error) throw safeError("analytics", error);
    const r = asRecord(res);
    return {
      latestDate: strOrNull(r.latestDate),
      hierarchy: asArray(r.hierarchy).map((x) => {
        const o = asRecord(x);
        return {
          store_code: str(o.store_code),
          store_name: str(o.store_name),
          depto: strOrNull(o.depto),
          secao: strOrNull(o.secao),
          grupo: strOrNull(o.grupo),
          subgrupo: strOrNull(o.subgrupo),
        };
      }),
      availableDates: asArray(r.availableDates).map(str),
    };
  });

export const getDashboardRankings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    FilterSchema.extend({ limit: z.number().int().min(1).max(50).optional().default(10) }).parse(d),
  )
  .handler(async ({ data, context }): Promise<DashboardRankingsResult> => {
    const supabase = context.supabase as DB;
    const { data: res, error } = await supabase.rpc("dashboard_rankings", {
      p_date_from: data.dateFrom || (null as unknown as string),
      p_date_to: data.dateTo || (null as unknown as string),
      p_stores: data.stores ?? [],
      p_deptos: data.deptos ?? [],
      p_secoes: data.secoes ?? [],
      p_grupos: data.grupos ?? [],
      p_subgrupos: data.subgrupos ?? [],
      p_limit: data.limit,
    });
    if (error) throw safeError("analytics", error);
    const r = asRecord(res);
    return {
      byDepto: parseNameVal(r.byDepto),
      bySecao: parseNameVal(r.bySecao),
      byGrupo: parseNameVal(r.byGrupo),
      bySubgrupo: parseNameVal(r.bySubgrupo),
      byProduto: asArray(r.byProduto).map((x) => {
        const o = asRecord(x);
        return { code: str(o.code), name: str(o.name), val: num(o.val) };
      }),
    };
  });
