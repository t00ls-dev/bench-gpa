import { createServerFn } from "@tanstack/react-start";
import type { PoolConnection } from "mysql2/promise";
import { requireAuth } from "./auth-middleware";
import { requireRateLimit } from "./rate-limit.middleware";
import db from "./db";
import { asArray, asRecord, dateTimeStr, num, str, strOrNull } from "./api-types";
import {
  CreateSavedAreaAnalysisSchema,
  SavedAreaAnalysisIdSchema,
  UpdateSavedAreaAnalysisSchema,
} from "./schemas";

export interface SavedAreaAnalysisSummary {
  id: string;
  name: string;
  storeCode: string;
  storeName: string | null;
  productCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface SavedAreaAnalysis extends SavedAreaAnalysisSummary {
  productCodes: string[];
}

function parseSummary(value: unknown): SavedAreaAnalysisSummary {
  const row = asRecord(value);
  return {
    id: str(row.id),
    name: str(row.name),
    storeCode: str(row.store_code),
    storeName: strOrNull(row.store_name),
    productCount: num(row.product_count),
    createdAt: dateTimeStr(row.created_at),
    updatedAt: dateTimeStr(row.updated_at),
  };
}

async function requireOwnedAnalysis(
  connection: PoolConnection,
  id: string,
  ownerUserId: string,
): Promise<string> {
  const [rows] = await connection.query(
    `SELECT store_code
     FROM saved_area_analyses
     WHERE id = ? AND owner_user_id = ?
     FOR UPDATE`,
    [id, ownerUserId],
  );
  const row = asArray(rows)[0];
  if (!row) throw new Error("Análise salva não encontrada.");
  return str(asRecord(row).store_code);
}

async function requireProductsInStore(
  connection: PoolConnection,
  storeCode: string,
  productCodes: string[],
): Promise<void> {
  const placeholders = productCodes.map(() => "?").join(", ");
  const [rows] = await connection.query(
    `SELECT COUNT(DISTINCT prod_code) AS matched_count
     FROM product_universe
     WHERE store_code = ? AND prod_code IN (${placeholders})`,
    [storeCode, ...productCodes],
  );
  const matchedCount = num(asRecord(asArray(rows)[0]).matched_count);
  if (matchedCount !== productCodes.length) {
    throw new Error("Um ou mais produtos não pertencem à loja selecionada.");
  }
}

async function insertProducts(
  connection: PoolConnection,
  analysisId: string,
  productCodes: string[],
): Promise<void> {
  const placeholders = productCodes.map(() => "(?, ?)").join(", ");
  const values = productCodes.flatMap((productCode) => [analysisId, productCode]);
  await connection.query(
    `INSERT INTO saved_area_analysis_products (analysis_id, prod_code)
     VALUES ${placeholders}`,
    values,
  );
}

export const listSavedAreaAnalyses = createServerFn({ method: "GET" })
  .middleware([requireAuth, requireRateLimit()])
  .handler(async ({ context }): Promise<SavedAreaAnalysisSummary[]> => {
    const [rows] = await db.query(
      `SELECT
         a.id,
         a.name,
         a.store_code,
         s.store_name,
         a.created_at,
         a.updated_at,
         (SELECT COUNT(*)
          FROM saved_area_analysis_products p
          WHERE p.analysis_id = a.id) AS product_count
       FROM saved_area_analyses a
       LEFT JOIN stores s ON s.store_code = a.store_code
       WHERE a.owner_user_id = ?
       ORDER BY a.updated_at DESC, a.id DESC`,
      [context.userId],
    );
    return asArray(rows).map(parseSummary);
  });

export const getSavedAreaAnalysis = createServerFn({ method: "POST" })
  .middleware([requireAuth, requireRateLimit()])
  .validator((data: unknown) => SavedAreaAnalysisIdSchema.parse(data))
  .handler(async ({ data, context }): Promise<SavedAreaAnalysis> => {
    const [rows] = await db.query(
      `SELECT
         a.id,
         a.name,
         a.store_code,
         s.store_name,
         a.created_at,
         a.updated_at,
         p.prod_code
       FROM saved_area_analyses a
       LEFT JOIN stores s ON s.store_code = a.store_code
       LEFT JOIN saved_area_analysis_products p ON p.analysis_id = a.id
       WHERE a.id = ? AND a.owner_user_id = ?
       ORDER BY p.prod_code`,
      [data.id, context.userId],
    );
    const analysisRows = asArray(rows);
    const analysisRow = analysisRows[0];
    if (!analysisRow) throw new Error("Análise salva não encontrada.");

    const productCodes = analysisRows
      .map((row) => strOrNull(asRecord(row).prod_code))
      .filter((productCode): productCode is string => productCode !== null);
    return {
      ...parseSummary({ ...asRecord(analysisRow), product_count: productCodes.length }),
      productCodes,
    };
  });

export const createSavedAreaAnalysis = createServerFn({ method: "POST" })
  .middleware([requireAuth, requireRateLimit()])
  .validator((data: unknown) => CreateSavedAreaAnalysisSchema.parse(data))
  .handler(async ({ data, context }): Promise<{ ok: true; id: string }> => {
    const connection = await db.getConnection();
    const id = crypto.randomUUID();
    try {
      await connection.beginTransaction();
      await requireProductsInStore(connection, data.storeCode, data.productCodes);
      await connection.query(
        `INSERT INTO saved_area_analyses (id, owner_user_id, name, store_code)
         VALUES (?, ?, ?, ?)`,
        [id, context.userId, data.name, data.storeCode],
      );
      await insertProducts(connection, id, data.productCodes);
      await connection.commit();
      return { ok: true, id };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  });

export const updateSavedAreaAnalysis = createServerFn({ method: "POST" })
  .middleware([requireAuth, requireRateLimit()])
  .validator((data: unknown) => UpdateSavedAreaAnalysisSchema.parse(data))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();
      const storeCode = await requireOwnedAnalysis(connection, data.id, context.userId);

      if (data.productCodes) {
        await requireProductsInStore(connection, storeCode, data.productCodes);
      }
      if (data.name !== undefined) {
        await connection.query(
          "UPDATE saved_area_analyses SET name = ? WHERE id = ? AND owner_user_id = ?",
          [data.name, data.id, context.userId],
        );
      }
      if (data.productCodes) {
        await connection.query("DELETE FROM saved_area_analysis_products WHERE analysis_id = ?", [
          data.id,
        ]);
        await insertProducts(connection, data.id, data.productCodes);
        await connection.query(
          "UPDATE saved_area_analyses SET updated_at = CURRENT_TIMESTAMP WHERE id = ? AND owner_user_id = ?",
          [data.id, context.userId],
        );
      }

      await connection.commit();
      return { ok: true };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  });

export const deleteSavedAreaAnalysis = createServerFn({ method: "POST" })
  .middleware([requireAuth, requireRateLimit()])
  .validator((data: unknown) => SavedAreaAnalysisIdSchema.parse(data))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();
      await requireOwnedAnalysis(connection, data.id, context.userId);
      await connection.query("DELETE FROM saved_area_analysis_products WHERE analysis_id = ?", [
        data.id,
      ]);
      await connection.query("DELETE FROM saved_area_analyses WHERE id = ? AND owner_user_id = ?", [
        data.id,
        context.userId,
      ]);
      await connection.commit();
      return { ok: true };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  });
