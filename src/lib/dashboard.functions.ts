import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireRateLimit } from "./rate-limit.middleware";
import { safeError } from "./safe-error";
import {
  DB,
  StoreOption,
  FilterOptionsResult,
  DashboardMetricsResult,
  DashboardRankingsResult,
  callMetrics,
  shiftPeriod,
  asRecord,
  asArray,
  str,
  strOrNull,
  num,
  parseNameVal,
  parseCodeNameVal,
} from "./rpc-utils";
import { FilterSchema, DashboardSchema, DashboardRankingsSchema } from "./schemas";

export const getFilterOptions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireRateLimit])
  .inputValidator((d: unknown) => FilterSchema.omit({ subgrupos: true }).parse(d ?? {}))
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
  .middleware([requireSupabaseAuth, requireRateLimit])
  .handler(async ({ context }): Promise<StoreOption[]> => {
    const supabase = context.supabase as DB;
    const { data, error } = await supabase
      .from("stores")
      .select("store_code, store_name")
      .order("store_code", { ascending: true });
    if (error) throw safeError("analytics", error);
    return (data ?? []) as StoreOption[];
  });

export const getDashboard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireRateLimit])
  .inputValidator((d: unknown) => DashboardSchema.parse(d))
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as DB;
    const currentPromise = callMetrics(supabase, data);
    let previousPromise: Promise<DashboardMetricsResult | null> = Promise.resolve(null);
    if (data.compare !== "none" && data.dateFrom && data.dateTo) {
      const prev = shiftPeriod(data.dateFrom, data.dateTo, data.compare);
      previousPromise = callMetrics(supabase, {
        ...data,
        dateFrom: prev.dateFrom,
        dateTo: prev.dateTo,
      });
    }
    const [current, previous] = await Promise.all([currentPromise, previousPromise]);
    return { current, previous };
  });

export const getLatestSaleInfo = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth, requireRateLimit])
  .handler(async ({ context }) => {
    const supabase = context.supabase as DB;
    const { data, error } = await supabase
      .from("import_log")
      .select("sale_date, row_count, imported_at")
      .order("sale_date", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw safeError("analytics", error);
    return data as { sale_date: string; row_count: number; imported_at: string } | null;
  });

export const getDashboardRankings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireRateLimit])
  .inputValidator((d: unknown) => DashboardRankingsSchema.parse(d))
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
