import { createServerFn } from "@tanstack/react-start";
import type { PoolConnection } from "mysql2/promise";
import { requireAuth } from "./auth-middleware";
import { requireRateLimit } from "./rate-limit.middleware";
import { assertAdmin } from "./admin-utils";
import { recordAudit } from "./audit";
import db from "./db";
import { asArray, asRecord, dateTimeStr, num, str, strOrNull } from "./api-types";
import {
  CreateSavedAreaAnalysisSchema,
  SavedAreaAnalysisIdSchema,
  SavedAreaAnalysisIdsSchema,
  TransferSavedAreaAnalysisSchema,
  UpdateSavedAreaAnalysisSchema,
} from "./schemas";

export interface SavedAreaAnalysisSummary {
  id: string;
  ownerUserId: string;
  name: string;
  storeCode: string;
  storeName: string | null;
  productCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface SavedAreaAnalysis extends SavedAreaAnalysisSummary {
  ownerName: string | null;
  ownerUsername: string | null;
  description: string | null;
  productCodes: string[];
  productHierarchy: SavedAreaProductHierarchy[];
}

export interface SavedAreaProductHierarchy {
  productCode: string;
  depto: string | null;
  secao: string | null;
  grupo: string | null;
  subgrupo: string | null;
}

function parseSummary(value: unknown): SavedAreaAnalysisSummary {
  const row = asRecord(value);
  return {
    id: str(row.id),
    ownerUserId: str(row.owner_user_id),
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
         a.owner_user_id,
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

export const listRecentSavedAreaAnalyses = createServerFn({ method: "POST" })
  .middleware([requireAuth, requireRateLimit()])
  .validator((data: unknown) => SavedAreaAnalysisIdsSchema.parse(data))
  .handler(async ({ data }): Promise<SavedAreaAnalysisSummary[]> => {
    const placeholders = data.ids.map(() => "?").join(", ");
    const [rows] = await db.query(
      `SELECT
         a.id,
         a.owner_user_id,
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
       WHERE a.id IN (${placeholders})`,
      data.ids,
    );
    const byId = new Map(asArray(rows).map((row) => [str(asRecord(row).id), parseSummary(row)]));
    return data.ids.flatMap((id) => {
      const analysis = byId.get(id);
      return analysis ? [analysis] : [];
    });
  });

export const getSavedAreaAnalysis = createServerFn({ method: "POST" })
  .middleware([requireAuth, requireRateLimit()])
  .validator((data: unknown) => SavedAreaAnalysisIdSchema.parse(data))
  .handler(async ({ data }): Promise<SavedAreaAnalysis> => {
    const [rows] = await db.query(
      `SELECT
         a.id,
         a.owner_user_id,
         owner.name AS owner_name,
         owner.username AS owner_username,
         a.name,
         a.description,
         a.store_code,
         s.store_name,
         a.created_at,
         a.updated_at,
         p.prod_code
       FROM saved_area_analyses a
       LEFT JOIN users owner ON owner.id = a.owner_user_id
       LEFT JOIN stores s ON s.store_code = a.store_code
       LEFT JOIN saved_area_analysis_products p ON p.analysis_id = a.id
       WHERE a.id = ?
       ORDER BY p.prod_code`,
      [data.id],
    );
    const analysisRows = asArray(rows);
    const analysisRow = analysisRows[0];
    if (!analysisRow) throw new Error("Análise salva não encontrada.");

    const productCodes = analysisRows.flatMap((row) => {
      const productCode = strOrNull(asRecord(row).prod_code);
      return productCode ? [productCode] : [];
    });
    const hierarchyByProductCode = new Map<
      string,
      Omit<SavedAreaProductHierarchy, "productCode">
    >();
    if (productCodes.length > 0) {
      const placeholders = productCodes.map(() => "?").join(", ");
      const [hierarchyRows] = await db.query(
        `SELECT prod_code, depto, secao, grupo, subgrupo
         FROM product_universe
         WHERE store_code = ? AND prod_code IN (${placeholders})`,
        [str(asRecord(analysisRow).store_code), ...productCodes],
      );
      for (const row of asArray(hierarchyRows)) {
        const record = asRecord(row);
        hierarchyByProductCode.set(str(record.prod_code), {
          depto: strOrNull(record.depto),
          secao: strOrNull(record.secao),
          grupo: strOrNull(record.grupo),
          subgrupo: strOrNull(record.subgrupo),
        });
      }
    }
    const productHierarchy = productCodes.map((productCode): SavedAreaProductHierarchy => ({
      productCode,
      ...(hierarchyByProductCode.get(productCode) ?? {
        depto: null,
        secao: null,
        grupo: null,
        subgrupo: null,
      }),
    }));
    return {
      ...parseSummary({ ...asRecord(analysisRow), product_count: productCodes.length }),
      ownerName: strOrNull(asRecord(analysisRow).owner_name),
      ownerUsername: strOrNull(asRecord(analysisRow).owner_username),
      description: strOrNull(asRecord(analysisRow).description),
      productCodes,
      productHierarchy,
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
        `INSERT INTO saved_area_analyses (id, owner_user_id, name, description, store_code)
          VALUES (?, ?, ?, ?, ?)`,
        [id, context.userId, data.name, data.description ?? null, data.storeCode],
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
      if (data.description !== undefined) {
        await connection.query(
          "UPDATE saved_area_analyses SET description = ? WHERE id = ? AND owner_user_id = ?",
          [data.description, data.id, context.userId],
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

export const transferSavedAreaAnalysis = createServerFn({ method: "POST" })
  .middleware([requireAuth, requireRateLimit()])
  .validator((data: unknown) => TransferSavedAreaAnalysisSchema.parse(data))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    await assertAdmin(context);
    const connection = await db.getConnection();
    const auditDetail = await (async () => {
      try {
        await connection.beginTransaction();
        const [analysisRows] = await connection.query(
          `SELECT a.owner_user_id, u.username AS owner_username
           FROM saved_area_analyses a
           LEFT JOIN users u ON u.id = a.owner_user_id
           WHERE a.id = ?
           FOR UPDATE`,
          [data.analysisId],
        );
        const analysis = asArray(analysisRows)[0];
        if (!analysis) throw new Error("Análise salva não encontrada.");
        const analysisRecord = asRecord(analysis);
        const previousOwnerUserId = str(analysisRecord.owner_user_id);
        const previousOwnerUsername = strOrNull(analysisRecord.owner_username);

        if (previousOwnerUserId === data.targetUserId) {
          throw new Error("O usuário selecionado já é o proprietário desta análise.");
        }

        const [targetRows] = await connection.query(
          `SELECT id, username
           FROM users
           WHERE id = ? AND is_active = TRUE AND password IS NOT NULL
           FOR UPDATE`,
          [data.targetUserId],
        );
        const target = asArray(targetRows)[0];
        if (!target) {
          throw new Error("Selecione um usuário ativo que já tenha concluído o primeiro acesso.");
        }
        const targetUsername = strOrNull(asRecord(target).username);

        const [updateResult] = await connection.query(
          `UPDATE saved_area_analyses
           SET owner_user_id = ?
           WHERE id = ? AND owner_user_id = ?`,
          [data.targetUserId, data.analysisId, previousOwnerUserId],
        );
        if (num(asRecord(updateResult).affectedRows) !== 1) {
          throw new Error(
            "A propriedade da análise foi alterada por outra operação. Tente novamente.",
          );
        }

        await connection.commit();
        return `proprietário anterior: ${previousOwnerUsername ?? previousOwnerUserId}; novo proprietário: ${targetUsername ?? data.targetUserId}`;
      } catch (error) {
        await connection.rollback();
        throw error;
      } finally {
        connection.release();
      }
    })();

    await recordAudit({
      action: "saved_area.transfer",
      actorId: context.userId,
      actorUsername: context.userUsername,
      targetType: "saved_area_analysis",
      targetId: data.analysisId,
      detail: auditDetail,
    });
    return { ok: true };
  });
