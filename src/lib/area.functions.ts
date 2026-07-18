import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireRateLimit } from "./rate-limit.middleware";
import { safeError } from "./safe-error";
import {
  DB,
  AreaAnalysisResult,
  AreaProduct,
  AreaHierarchyItem,
  AreaFilterHierarchyResult,
  asRecord,
  asArray,
  str,
  strOrNull,
  num,
  numOrNull,
  parseDateVal,
} from "./rpc-utils";
import { AreaAnalysisSchema } from "./schemas";

export const getAreaAnalysis = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireRateLimit])
  .inputValidator((d: unknown) => AreaAnalysisSchema.parse(d))
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
  .middleware([requireSupabaseAuth, requireRateLimit])
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
