import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
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
