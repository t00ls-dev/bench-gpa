import { createServerFn } from "@tanstack/react-start";
import { requireAuth } from "./auth-middleware";
import { requireRateLimit } from "./rate-limit.middleware";
import db from "./db";
import {
  StoreOption,
  FilterOptionsResult,
  DashboardMetricsResult,
  DashboardRankingsResult,
  callMetrics,
  shiftPeriod,
  asArray,
  str,
  strOrNull,
  num,
  asRecord,
  parseNameVal,
  parseCodeNameVal,
} from "./api-types";
import { FilterSchema, DashboardSchema, DashboardRankingsSchema } from "./schemas";

export const getFilterOptions = createServerFn({ method: "POST" })
  .middleware([requireAuth, requireRateLimit()])
  .inputValidator((d: unknown) => FilterSchema.omit({ subgrupos: true }).parse(d ?? {}))
  .handler(async ({ data }): Promise<FilterOptionsResult> => {
    const { cache } = await import("./cache");
    const key = `filter_options:${(data.stores ?? []).join(",")}:${(data.deptos ?? []).join(",")}:${(data.secoes ?? []).join(",")}:${(data.grupos ?? []).join(",")}`;
    return cache.wrap(
      key,
      async () => {
        const [rs] = await db.query("CALL filter_options(?, ?, ?, ?, ?, ?)", [
          data.dateFrom || null,
          data.dateTo || null,
          JSON.stringify(data.stores ?? []),
          JSON.stringify(data.deptos ?? []),
          JSON.stringify(data.secoes ?? []),
          JSON.stringify(data.grupos ?? []),
        ]);
        const [latestDateRows, stores, deptos, secoes, grupos, subgrupos, availableDates] =
          rs as unknown[];
        return {
          latestDate: strOrNull(asRecord(asArray(latestDateRows)[0]).latest_date ?? null),
          stores: asArray(stores).map((r) => {
            const rec = asRecord(r);
            return { store_code: str(rec.store_code), store_name: str(rec.store_name) };
          }),
          deptos: asArray(deptos).map((r) => str(asRecord(r).depto)),
          secoes: asArray(secoes).map((r) => str(asRecord(r).secao)),
          grupos: asArray(grupos).map((r) => str(asRecord(r).grupo)),
          subgrupos: asArray(subgrupos).map((r) => str(asRecord(r).subgrupo)),
          availableDates: asArray(availableDates).map((r) => str(asRecord(r).sale_date)),
        };
      },
      300_000,
    );
  });

export const getStores = createServerFn({ method: "GET" })
  .middleware([requireAuth, requireRateLimit()])
  .handler(async (): Promise<StoreOption[]> => {
    const [rows] = await db.query("SELECT store_code, store_name FROM stores ORDER BY store_code");
    return (rows ?? []) as StoreOption[];
  });

export const getDashboard = createServerFn({ method: "POST" })
  .middleware([requireAuth, requireRateLimit()])
  .inputValidator((d: unknown) => DashboardSchema.parse(d))
  .handler(async ({ data }) => {
    const currentPromise = callMetrics(data);
    let previousPromise: Promise<DashboardMetricsResult | null> = Promise.resolve(null);
    if (data.compare !== "none" && data.dateFrom && data.dateTo) {
      const prev = shiftPeriod(data.dateFrom, data.dateTo, data.compare);
      previousPromise = callMetrics({ ...data, dateFrom: prev.dateFrom, dateTo: prev.dateTo });
    }
    const [current, previous] = await Promise.all([currentPromise, previousPromise]);
    return { current, previous };
  });

export const getLatestSaleInfo = createServerFn({ method: "GET" })
  .middleware([requireAuth, requireRateLimit()])
  .handler(async () => {
    const [rows] = await db.query(
      "SELECT sale_date, row_count, imported_at FROM import_log ORDER BY sale_date DESC LIMIT 1",
    );
    const rowRaw = asArray(rows)[0];
    if (!rowRaw) return null;
    const row = asRecord(rowRaw);
    return {
      sale_date: str(row.sale_date),
      row_count: num(row.row_count),
      imported_at: str(row.imported_at),
    };
  });

export const getDashboardRankings = createServerFn({ method: "POST" })
  .middleware([requireAuth, requireRateLimit()])
  .inputValidator((d: unknown) => DashboardRankingsSchema.parse(d))
  .handler(async ({ data }): Promise<DashboardRankingsResult> => {
    const [rs2] = await db.query("CALL dashboard_rankings(?, ?, ?, ?, ?, ?, ?, ?)", [
      data.dateFrom || null,
      data.dateTo || null,
      JSON.stringify(data.stores ?? []),
      JSON.stringify(data.deptos ?? []),
      JSON.stringify(data.secoes ?? []),
      JSON.stringify(data.grupos ?? []),
      JSON.stringify(data.subgrupos ?? []),
      data.limit ?? 10,
    ]);
    const [byDepto, bySecao, byGrupo, bySubgrupo, byProduto] = rs2 as unknown[];
    return {
      byDepto: parseNameVal(byDepto),
      bySecao: parseNameVal(bySecao),
      byGrupo: parseNameVal(byGrupo),
      bySubgrupo: parseNameVal(bySubgrupo),
      byProduto: parseCodeNameVal(byProduto),
    };
  });
