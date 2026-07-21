import { createServerFn } from "@tanstack/react-start";
import { requireAuth } from "./auth-middleware";
import { requireRateLimit } from "./rate-limit.middleware";
import { z } from "zod";
import db from "./db";
import { ProductAnalysisResult, str, strOrNull, num } from "./api-types";
import { SingleQuerySchema, SingleProdCodeSchema } from "./schemas";

export const searchProducts = createServerFn({ method: "POST" })
  .middleware([requireAuth, requireRateLimit])
  .inputValidator((d: unknown) => SingleQuerySchema.parse(d))
  .handler(async ({ data }) => {
    const q = `%${data.q.trim()}%`;
    const [rows] = await db.query(
      "SELECT DISTINCT prod_code, prod_name FROM products WHERE prod_name LIKE ? OR prod_code LIKE ? LIMIT 20",
      [q, q],
    );
    return (rows ?? []) as { prod_code: string; prod_name: string }[];
  });

export const getProductByCode = createServerFn({ method: "POST" })
  .middleware([requireAuth, requireRateLimit])
  .inputValidator((d: unknown) => SingleProdCodeSchema.parse(d))
  .handler(async ({ data }) => {
    const [rows] = await db.query(
      "SELECT DISTINCT prod_code, prod_name FROM products WHERE prod_code = ? LIMIT 1",
      [data.prodCode.trim()],
    );
    return ((rows as any[])[0] ?? null) as { prod_code: string; prod_name: string } | null;
  });

export const getProductAnalysis = createServerFn({ method: "POST" })
  .middleware([requireAuth, requireRateLimit])
  .inputValidator((d: unknown) =>
    z
      .object({
        prodCode: z.string(),
        storeCode: z.string().optional().nullable(),
        referenceDate: z.string().optional().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data }): Promise<ProductAnalysisResult> => {
    const [rs] =
      await db.query("CALL product_analysis(?, ?, ?)", [
        data.prodCode,
        data.storeCode || null,
        data.referenceDate || null,
      ]) as any[];
    const [productRows, refValueRows, byStore, evolution, lastFourSameWeekday, lastFourAll] = rs;
    const productRow = (productRows as any[])[0] ?? null;
    return {
      product: productRow
        ? {
            prod_code: str(productRow.prod_code),
            prod_name: str(productRow.prod_name),
            depto: strOrNull(productRow.depto),
            secao: strOrNull(productRow.secao),
            grupo: strOrNull(productRow.grupo),
            subgrupo: strOrNull(productRow.subgrupo),
          }
        : null,
      refDate: strOrNull((refValueRows as any[])[0]?.ref_date ?? null),
      refValue: num((refValueRows as any[])[0]?.ref_value ?? 0),
      byStore: (byStore ?? []).map((r: any) => ({
        code: r.code,
        name: r.name,
        val: Number(r.val),
      })),
      evolution: (evolution ?? []).map((d: any) => ({
        date: str(d.date),
        val: num(d.val),
      })),
      lastFourSameWeekday: (lastFourSameWeekday ?? []).map((d: any) => ({
        date: str(d.date),
        val: num(d.val),
      })),
      lastFourAll: (lastFourAll ?? []).map((d: any) => ({
        date: str(d.date),
        val: num(d.val),
      })),
    };
  });
