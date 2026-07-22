import { createServerFn } from "@tanstack/react-start";
import { requireAuth } from "./auth-middleware";
import { requireRateLimit } from "./rate-limit.middleware";
import db from "./db";
import {
  AreaAnalysisResult,
  AreaFilterHierarchyResult,
  asArray,
  asRecord,
  str,
  strOrNull,
  num,
  numOrNull,
  parseDateVal,
} from "./api-types";
import { AreaAnalysisSchema } from "./schemas";

export const getAreaAnalysis = createServerFn({ method: "POST" })
  .middleware([requireAuth, requireRateLimit])
  .inputValidator((d: unknown) => AreaAnalysisSchema.parse(d))
  .handler(async ({ data }): Promise<AreaAnalysisResult> => {
    const [rs] = await db.query("CALL area_analysis(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", [
      data.dateFrom,
      data.dateTo,
      JSON.stringify(data.stores ?? []),
      JSON.stringify(data.deptos ?? []),
      JSON.stringify(data.secoes ?? []),
      JSON.stringify(data.grupos ?? []),
      JSON.stringify(data.subgrupos ?? []),
      data.page ?? null,
      data.pageSize,
      data.search,
      data.sortBy === "daysSince" ? "val" : data.sortBy,
      data.sortDir,
    ]);
    const [kpiRows, totalCountRows, byDate, products] = rs as unknown[];
    const kpi = asRecord(asArray(kpiRows)[0]);
    const totalProducts = num(asRecord(asArray(totalCountRows)[0]).total_products);
    return {
      total: num(kpi.total),
      plusTotal: num(kpi.plus_total),
      plusWithSale: num(kpi.plus_with_sale),
      plusWithoutSale: num(kpi.plus_without_sale),
      avgPerPlu: num(kpi.plus_with_sale) > 0 ? num(kpi.total) / num(kpi.plus_with_sale) : 0,
      products: asArray(products).map((p) => {
        const r = asRecord(p);
        return {
          prod_code: str(r.prod_code),
          prod_name: str(r.prod_name),
          depto: strOrNull(r.depto),
          secao: strOrNull(r.secao),
          grupo: strOrNull(r.grupo),
          subgrupo: strOrNull(r.subgrupo),
          val: num(r.val),
          qty: num(r.qty),
          lastSaleDate: strOrNull(r.last_sale_date),
        };
      }),
      byDate: parseDateVal(byDate),
      totalProducts,
      page: data.page ?? undefined,
      pageSize: data.pageSize,
      totalPages: data.pageSize ? Math.ceil(totalProducts / data.pageSize) : undefined,
    };
  });

export const getAreaFilterHierarchy = createServerFn({ method: "POST" })
  .middleware([requireAuth, requireRateLimit])
  .handler(async (): Promise<AreaFilterHierarchyResult> => {
    const { cache } = await import("./cache");
    return cache.wrap(
      "area_filter_hierarchy",
      async () => {
        const [rs2] = await db.query("CALL area_filter_hierarchy()");
        const [latestDateRows, hierarchy, availableDates] = rs2 as unknown[];
        return {
          latestDate: strOrNull(asRecord(asArray(latestDateRows)[0]).latest_date ?? null),
          hierarchy: asArray(hierarchy).map((h) => {
            const r = asRecord(h);
            return {
              store_code: str(r.store_code),
              store_name: str(r.store_name),
              depto: strOrNull(r.depto),
              secao: strOrNull(r.secao),
              grupo: strOrNull(r.grupo),
              subgrupo: strOrNull(r.subgrupo),
            };
          }),
          availableDates: asArray(availableDates).map((r) => str(asRecord(r).sale_date)),
        };
      },
      300_000,
    );
  });
