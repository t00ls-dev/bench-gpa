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
import { ProductSearchSchema, SingleProdCodeSchema } from "./schemas";

function escapeLike(value: string) {
  return value.replaceAll("=", "==").replaceAll("%", "=%").replaceAll("_", "=_");
}

export const searchProducts = createServerFn({ method: "POST" })
  .middleware([requireAuth, requireRateLimit()])
  .inputValidator((d: unknown) => ProductSearchSchema.parse(d))
  .handler(async ({ data }) => {
    const query = data.q.replace(/\s+/g, " ");
    const terms = query.split(" ");
    const storePredicate = data.storeCodes.length
      ? `u.store_code IN (${data.storeCodes.map(() => "?").join(", ")}) AND `
      : "";
    const namePredicates = terms.map(() => "u.prod_name LIKE ? ESCAPE '='").join(" AND ");
    const containsQuery = `%${escapeLike(query)}%`;
    const nameParams = terms.map((term) => `%${escapeLike(term)}%`);
    const [rows] = await db.query(
      `SELECT u.prod_code, MAX(u.prod_name) AS prod_name
       FROM product_universe u
       WHERE ${storePredicate}(u.prod_code LIKE ? ESCAPE '=' OR (${namePredicates}))
       GROUP BY u.prod_code
       ORDER BY CASE
         WHEN u.prod_code = ? THEN 0
         WHEN u.prod_code LIKE ? ESCAPE '=' THEN 1
         WHEN MAX(u.prod_name) LIKE ? ESCAPE '=' THEN 2
         ELSE 3
       END,
       MAX(u.last_sale_date) DESC,
       prod_name,
       u.prod_code
       LIMIT 20`,
      [
        ...data.storeCodes,
        containsQuery,
        ...nameParams,
        query,
        `${escapeLike(query)}%`,
        `${escapeLike(terms[0])}%`,
      ],
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
