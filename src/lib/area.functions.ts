import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireRateLimit } from "./rate-limit.middleware";
import { safeError } from "./safe-error";
import db from "./db";
import {
  AreaAnalysisResult,
  AreaFilterHierarchyResult,
  str,
  strOrNull,
  num,
  numOrNull,
} from "./rpc-utils";
import { AreaAnalysisSchema } from "./schemas";

export const getAreaAnalysis = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireRateLimit])
  .inputValidator((d: unknown) => AreaAnalysisSchema.parse(d))
  .handler(async ({ data }): Promise<AreaAnalysisResult> => {
    const [kpiRows, totalCountRows, byDate, products] = await db.query(
      "CALL area_analysis(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [
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
        data.sortBy,
        data.sortDir,
      ],
    );
    const kpi = (kpiRows as any[])[0] ?? {};
    const totalProducts = Number((totalCountRows as any[])[0]?.total_products ?? 0);
    return {
      total: num(kpi.total),
      plusTotal: num(kpi.plus_total),
      plusWithSale: num(kpi.plus_with_sale),
      plusWithoutSale: num(kpi.plus_without_sale),
      avgPerPlu:
        num(kpi.plus_with_sale) > 0 ? num(kpi.total) / num(kpi.plus_with_sale) : 0,
      products: (products as any[]).map((p: any) => ({
        prod_code: str(p.prod_code),
        prod_name: str(p.prod_name),
        depto: strOrNull(p.depto),
        secao: strOrNull(p.secao),
        grupo: strOrNull(p.grupo),
        subgrupo: strOrNull(p.subgrupo),
        val: num(p.val),
        qty: num(p.qty),
        lastSaleDate: null,
      })),
      byDate: (byDate as any[]).map((d: any) => ({
        date: str(d.date),
        val: num(d.val),
      })),
      totalProducts,
      page: data.page ?? undefined,
      pageSize: data.pageSize,
      totalPages: data.pageSize ? Math.ceil(totalProducts / data.pageSize) : undefined,
    };
  });

export const getAreaFilterHierarchy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireRateLimit])
  .handler(async (): Promise<AreaFilterHierarchyResult> => {
    const { cache } = await import("./cache");
    return cache.wrap(
      "area_filter_hierarchy",
      async () => {
        const [latestDateRows, hierarchy, availableDates] = await db.query(
          "CALL area_filter_hierarchy()",
        );
        return {
          latestDate: strOrNull((latestDateRows as any[])[0]?.latest_date ?? null),
          hierarchy: (hierarchy as any[]).map((r: any) => ({
            store_code: str(r.store_code),
            store_name: str(r.store_name),
            depto: strOrNull(r.depto),
            secao: strOrNull(r.secao),
            grupo: strOrNull(r.grupo),
            subgrupo: strOrNull(r.subgrupo),
          })),
          availableDates: (availableDates as any[]).map((r: any) => str(r.sale_date)),
        };
      },
      300_000,
    );
  });
