import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { safeError } from "./safe-error";
import {
  DB,
  ProductAnalysisResult,
  asRecord,
  asArray,
  str,
  strOrNull,
  num,
  parseCodeNameVal,
  parseDateVal,
} from "./rpc-utils";

export const searchProducts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ q: z.string().min(3) }).parse(d))
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as DB;
    const { data: rows, error } = await supabase.rpc("product_search", { p_q: data.q.trim() });
    if (error) throw safeError("analytics", error);
    return (rows ?? []) as { prod_code: string; prod_name: string }[];
  });

export const getProductByCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ prodCode: z.string().min(1) }).parse(d))
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as DB;
    const { data: rows, error } = await supabase.rpc("get_product_by_code", {
      p_code: data.prodCode.trim(),
    });
    if (error) throw safeError("analytics", error);
    const row = (rows ?? [])[0] as { prod_code: string; prod_name: string } | undefined;
    return row ?? null;
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
