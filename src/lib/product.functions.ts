import { createServerFn } from "@tanstack/react-start";
import { requireAuth } from "./auth-middleware";
import { requireRateLimit } from "./rate-limit.middleware";
import { z } from "zod";
import db from "./db";
import {
  ProductAnalysisResult,
  asArray,
  asRecord,
  str,
  strOrNull,
  num,
  parseCodeNameVal,
  parseDateVal,
} from "./api-types";
import { SingleQuerySchema, SingleProdCodeSchema } from "./schemas";

export const searchProducts = createServerFn({ method: "POST" })
  .middleware([requireAuth, requireRateLimit()])
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
  .middleware([requireAuth, requireRateLimit()])
  .inputValidator((d: unknown) => SingleProdCodeSchema.parse(d))
  .handler(async ({ data }) => {
    const [rows] = await db.query(
      "SELECT DISTINCT prod_code, prod_name FROM products WHERE prod_code = ? LIMIT 1",
      [data.prodCode.trim()],
    );
    return (asArray(rows)[0] ?? null) as { prod_code: string; prod_name: string } | null;
  });

export const getProductAnalysis = createServerFn({ method: "POST" })
  .middleware([requireAuth, requireRateLimit()])
  .inputValidator((d: unknown) =>
    z
      .object({
        prodCode: z.string(),
        storeCodes: z.array(z.string()).optional().default([]),
        referenceDate: z.string().optional().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data }): Promise<ProductAnalysisResult> => {
    const [rs] = await db.query("CALL product_analysis(?, ?, ?)", [
      data.prodCode,
      JSON.stringify(data.storeCodes ?? []),
      data.referenceDate || null,
    ]);
    const [productRows, refValueRows, byStore, evolution, lastFourSameWeekday, lastFourAll] =
      rs as unknown[];
    const productRowRaw = asArray(productRows)[0];
    const productRow = productRowRaw ? asRecord(productRowRaw) : null;
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
      refDate: strOrNull(asRecord(asArray(refValueRows)[0]).ref_date ?? null),
      refValue: num(asRecord(asArray(refValueRows)[0]).ref_value),
      byStore: parseCodeNameVal(byStore),
      evolution: parseDateVal(evolution),
      lastFourSameWeekday: parseDateVal(lastFourSameWeekday),
      lastFourAll: parseDateVal(lastFourAll),
    };
  });
