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
  asArray,
  str,
  strOrNull,
  num,
  asRecord,
  parseNameVal,
  parseCodeNameVal,
  dateTimeStr,
} from "./api-types";
import { FilterSchema, DashboardRankingsSchema } from "./schemas";
import { CACHE_TTL_SHORT, CACHE_TTL_LONG } from "./cache";

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
          // Sort ascending at the boundary: every consumer (default range seed,
          // clamp effects, DateRangePicker.clampRange/min-maxIso) assumes
          // availableDates[0] is the earliest date. The stored procedure's
          // ORDER BY is not guaranteed to survive a schema drift (a prod DB
          // running an older proc revision returned them descending, producing
          // an inverted from>to range that loaded no data). ISO YYYY-MM-DD
          // strings sort chronologically, so this enforces the invariant
          // regardless of what the DB returns.
          availableDates: asArray(availableDates)
            .map((r) => str(asRecord(r).sale_date))
            .sort(),
        };
      },
      CACHE_TTL_LONG,
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
  .inputValidator((d: unknown) => FilterSchema.parse(d))
  .handler(async ({ data }): Promise<DashboardMetricsResult> => callMetrics(data));

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
      imported_at: dateTimeStr(row.imported_at),
    };
  });

export const getDashboardRankings = createServerFn({ method: "POST" })
  .middleware([requireAuth, requireRateLimit()])
  .inputValidator((d: unknown) => DashboardRankingsSchema.parse(d))
  .handler(async ({ data }): Promise<DashboardRankingsResult> => {
    // Same cache callMetrics already used for dashboard_metrics: this was the
    // only half of the home screen that still hit the database on every
    // render. The proc used to scan sales_prod_daily_agg five times, once
    // per ranking, averaging 3.8s on the default 7-day window. Now it scans
    // once: measured in prod, 32.4s -> 19.0s on a 28-day window
    // (docs/medicao-performance.md). Still expensive enough for the cache to
    // be worth it.
    const { cache } = await import("./cache");
    const key = `rankings:${data.dateFrom ?? ""}:${data.dateTo ?? ""}:${(data.stores ?? []).join(",")}:${(data.deptos ?? []).join(",")}:${(data.secoes ?? []).join(",")}:${(data.grupos ?? []).join(",")}:${(data.subgrupos ?? []).join(",")}:${data.limit ?? 10}`;
    return cache.wrap(
      key,
      async () => {
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
      },
      // Explicit now: this call used to omit the TTL and fall back to
      // SimpleCache's 60s default, which was invisible to anyone reading
      // just this call site.
      CACHE_TTL_SHORT,
    );
  });
