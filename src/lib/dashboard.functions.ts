import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireRateLimit } from "./rate-limit.middleware";
import { safeError } from "./safe-error";
import db from "./db";
import {
  StoreOption,
  FilterOptionsResult,
  DashboardRankingsResult,
  callMetrics,
  shiftPeriod,
  asArray,
  str,
  strOrNull,
  num,
  asRecord,
  parseNameVal,
} from "./rpc-utils";
import { FilterSchema, DashboardSchema, DashboardRankingsSchema } from "./schemas";

export const getFilterOptions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireRateLimit])
  .inputValidator((d: unknown) => FilterSchema.omit({ subgrupos: true }).parse(d ?? {}))
  .handler(async ({ data }): Promise<FilterOptionsResult> => {
    const [latestDateRows, stores, deptos, secoes, grupos, subgrupos, availableDates] =
      await db.query("CALL filter_options(?, ?, ?, ?, ?, ?)", [
        data.dateFrom || null,
        data.dateTo || null,
        JSON.stringify(data.stores ?? []),
        JSON.stringify(data.deptos ?? []),
        JSON.stringify(data.secoes ?? []),
        JSON.stringify(data.grupos ?? []),
      ]);
    return {
      latestDate: strOrNull((latestDateRows as any[])[0]?.latest_date ?? null),
      stores: (stores as any[]).map((r) => ({
        store_code: str(r.store_code),
        store_name: str(r.store_name),
      })),
      deptos: (deptos as any[]).map((r) => str(r.depto)),
      secoes: (secoes as any[]).map((r) => str(r.secao)),
      grupos: (grupos as any[]).map((r) => str(r.grupo)),
      subgrupos: (subgrupos as any[]).map((r) => str(r.subgrupo)),
      availableDates: (availableDates as any[]).map((r) => str(r.sale_date)),
    };
  });

export const getStores = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth, requireRateLimit])
  .handler(async (): Promise<StoreOption[]> => {
    const [rows] = await db.query(
      "SELECT store_code, store_name FROM stores ORDER BY store_code",
    );
    return (rows ?? []) as StoreOption[];
  });

export const getDashboard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireRateLimit])
  .inputValidator((d: unknown) => DashboardSchema.parse(d))
  .handler(async ({ data }) => {
    const currentPromise = callMetrics(data);
    let previousPromise: Promise<ReturnType<typeof callMetrics> | null> = Promise.resolve(null);
    if (data.compare !== "none" && data.dateFrom && data.dateTo) {
      const prev = shiftPeriod(data.dateFrom, data.dateTo, data.compare);
      previousPromise = callMetrics({ ...data, dateFrom: prev.dateFrom, dateTo: prev.dateTo });
    }
    const [current, previous] = await Promise.all([currentPromise, previousPromise]);
    return { current, previous };
  });

export const getLatestSaleInfo = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth, requireRateLimit])
  .handler(async () => {
    const [rows] = await db.query(
      "SELECT sale_date, row_count, imported_at FROM import_log ORDER BY sale_date DESC LIMIT 1",
    );
    return ((rows as any[])[0] ?? null) as {
      sale_date: string;
      row_count: number;
      imported_at: string;
    } | null;
  });

export const getDashboardRankings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireRateLimit])
  .inputValidator((d: unknown) => DashboardRankingsSchema.parse(d))
  .handler(async ({ data }): Promise<DashboardRankingsResult> => {
    const [byDepto, bySecao, byGrupo, bySubgrupo, byProduto] = await db.query(
      "CALL dashboard_rankings(?, ?, ?, ?, ?, ?, ?, ?)",
      [
        data.dateFrom || null,
        data.dateTo || null,
        JSON.stringify(data.stores ?? []),
        JSON.stringify(data.deptos ?? []),
        JSON.stringify(data.secoes ?? []),
        JSON.stringify(data.grupos ?? []),
        JSON.stringify(data.subgrupos ?? []),
        data.limit ?? 10,
      ],
    );
    return {
      byDepto: (byDepto as any[]).map((r) => ({ name: r.name, val: Number(r.val) })),
      bySecao: (bySecao as any[]).map((r) => ({ name: r.name, val: Number(r.val) })),
      byGrupo: (byGrupo as any[]).map((r) => ({ name: r.name, val: Number(r.val) })),
      bySubgrupo: (bySubgrupo as any[]).map((r) => ({ name: r.name, val: Number(r.val) })),
      byProduto: (byProduto as any[]).map((r) => ({
        code: r.code,
        name: r.name,
        val: Number(r.val),
      })),
    };
  });
