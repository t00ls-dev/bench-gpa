import { createServerFn } from "@tanstack/react-start";
import { requireAuth } from "./auth-middleware";
import { requireRateLimit } from "./rate-limit.middleware";
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
  .middleware([requireAuth, requireRateLimit])
  .inputValidator((d: unknown) => FilterSchema.omit({ subgrupos: true }).parse(d ?? {}))
  .handler(async ({ data }): Promise<FilterOptionsResult> => {
    const { cache } = await import("./cache");
    const key = `filter_options:${data.dateFrom ?? ""}:${data.dateTo ?? ""}:${(data.stores ?? []).join(",")}:${(data.deptos ?? []).join(",")}:${(data.secoes ?? []).join(",")}:${(data.grupos ?? []).join(",")}`;
    return cache.wrap(key, async () => {
      const [rs] =
        await db.query("CALL filter_options(?, ?, ?, ?, ?, ?)", [
          data.dateFrom || null,
          data.dateTo || null,
          JSON.stringify(data.stores ?? []),
          JSON.stringify(data.deptos ?? []),
          JSON.stringify(data.secoes ?? []),
          JSON.stringify(data.grupos ?? []),
        ]);
      const [latestDateRows, stores, deptos, secoes, grupos, subgrupos, availableDates] = rs;
      return {
        latestDate: strOrNull((latestDateRows as any[])[0]?.latest_date ?? null),
        stores: (stores ?? []).map((r: any) => ({
          store_code: str(r.store_code),
          store_name: str(r.store_name),
        })),
        deptos: (deptos ?? []).map((r: any) => str(r.depto)),
        secoes: (secoes ?? []).map((r: any) => str(r.secao)),
        grupos: (grupos ?? []).map((r: any) => str(r.grupo)),
        subgrupos: (subgrupos ?? []).map((r: any) => str(r.subgrupo)),
        availableDates: (availableDates ?? []).map((r: any) => str(r.sale_date)),
      };
    }, 300_000);
  });

export const getStores = createServerFn({ method: "GET" })
  .middleware([requireAuth, requireRateLimit])
  .handler(async (): Promise<StoreOption[]> => {
    const [rows] = await db.query(
      "SELECT store_code, store_name FROM stores ORDER BY store_code",
    );
    return (rows ?? []) as StoreOption[];
  });

export const getDashboard = createServerFn({ method: "POST" })
  .middleware([requireAuth, requireRateLimit])
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
  .middleware([requireAuth, requireRateLimit])
  .handler(async () => {
    const [rows] = await db.query(
      "SELECT sale_date, row_count, imported_at FROM import_log ORDER BY sale_date DESC LIMIT 1",
    );
    const row = (rows as any[])[0] ?? null;
    if (!row) return null;
    return {
      sale_date: row.sale_date instanceof Date
        ? row.sale_date.toISOString().split("T")[0]
        : String(row.sale_date).slice(0, 10),
      row_count: Number(row.row_count),
      imported_at: String(row.imported_at),
    };
  });

export const getDashboardRankings = createServerFn({ method: "POST" })
  .middleware([requireAuth, requireRateLimit])
  .inputValidator((d: unknown) => DashboardRankingsSchema.parse(d))
  .handler(async ({ data }): Promise<DashboardRankingsResult> => {
    const [rs2] = await db.query(
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
    const [byDepto, bySecao, byGrupo, bySubgrupo, byProduto] = rs2;
    return {
      byDepto: (byDepto ?? []).map((r: any) => ({ name: r.name, val: Number(r.val) })),
      bySecao: (bySecao ?? []).map((r: any) => ({ name: r.name, val: Number(r.val) })),
      byGrupo: (byGrupo ?? []).map((r: any) => ({ name: r.name, val: Number(r.val) })),
      bySubgrupo: (bySubgrupo ?? []).map((r: any) => ({ name: r.name, val: Number(r.val) })),
      byProduto: (byProduto ?? []).map((r: any) => ({
        code: r.code,
        name: r.name,
        val: Number(r.val),
      })),
    };
  });
