import { createServerFn } from "@tanstack/react-start";
import { requireAuth } from "./auth-middleware";
import { requireRateLimit } from "./rate-limit.middleware";
import { assertAdmin } from "./admin-utils";
import db from "./db";
import { asArray, asRecord, str, num, dateTimeStr } from "./api-types";
import {
  BeginImportSchema,
  CancelImportSchema,
  FinalizeImportSchema,
  InsertSalesChunkSchema,
} from "./schemas";
import { STAGING_COLS, toStagingRow } from "./staging-row";
import { CACHE_TTL_SHORT } from "./cache";
import { mapImportError } from "./import-errors";

async function releaseImportLock(batchId: string, userId: string): Promise<void> {
  await db.query("CALL release_import_lock(?, ?)", [batchId, userId]);
}

export const beginImport = createServerFn({ method: "POST" })
  .middleware([requireAuth, requireRateLimit("upload")])
  .inputValidator((d: unknown) => BeginImportSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    if (data.total_rows === 0) throw new Error("Nenhuma linha de venda para importar.");

    try {
      await db.query("CALL acquire_import_lock(?, ?, ?, ?, ?)", [
        data.batch_id,
        data.sale_date,
        context.userId,
        JSON.stringify(data.stores),
        JSON.stringify(data.products),
      ]);
    } catch (error) {
      throw mapImportError(error);
    }

    return { ok: true, batch_id: data.batch_id };
  });

export const insertSalesChunk = createServerFn({ method: "POST" })
  .middleware([requireAuth, requireRateLimit("upload")])
  .inputValidator((d: unknown) => InsertSalesChunkSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const connection = await db.getConnection();

    try {
      await connection.beginTransaction();
      await connection.query("CALL renew_import_lock(?, ?, ?)", [
        data.batch_id,
        data.sale_date,
        context.userId,
      ]);

      // The lease row remains locked until this INSERT commits. Cancellation
      // or stale takeover cannot slip between renewal and insertion.
      const placeholders = data.rows
        .map(() => `(${STAGING_COLS.map(() => "?").join(", ")})`)
        .join(", ");
      const values = data.rows.flatMap((r) =>
        toStagingRow(r as Record<string, unknown>, data.batch_id, data.sale_date),
      );

      await connection.query(
        `INSERT INTO staging_sales (${STAGING_COLS.join(", ")}) VALUES ${placeholders}`,
        values,
      );
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw mapImportError(error);
    } finally {
      connection.release();
    }

    return { inserted: data.rows.length };
  });

export const getImportedDates = createServerFn({ method: "GET" })
  .middleware([requireAuth, requireRateLimit()])
  .handler(async () => {
    const { cache } = await import("./cache");
    return cache.wrap(
      "imported_dates",
      async () => {
        const [rows] = await db.query("CALL imported_dates()");
        const data = asArray(asArray(rows)[0]);
        return data.map((r) => {
          const rec = asRecord(r);
          return {
            sale_date: str(rec.sale_date),
            row_count: num(rec.row_count),
            imported_at: dateTimeStr(rec.imported_at),
          };
        });
      },
      CACHE_TTL_SHORT,
    );
  });

export const finalizeImport = createServerFn({ method: "POST" })
  .middleware([requireAuth, requireRateLimit("upload")])
  .inputValidator((d: unknown) => FinalizeImportSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);

    try {
      await db.query("CALL finalize_import(?, ?, ?, ?)", [
        data.batch_id,
        data.sale_date,
        data.row_count,
        context.userId,
      ]);
    } catch (error) {
      throw mapImportError(error);
    }

    return { ok: true };
  });

export const cancelImport = createServerFn({ method: "POST" })
  .middleware([requireAuth, requireRateLimit("upload")])
  .inputValidator((d: unknown) => CancelImportSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    await releaseImportLock(data.batch_id, context.userId);
    return { ok: true } as const;
  });
