import { createServerFn } from "@tanstack/react-start";
import { requireAuth } from "./auth-middleware";
import { requireRateLimit } from "./rate-limit.middleware";
import { assertAdmin } from "./admin-utils";
import db from "./db";
import { asArray, asRecord, str, num, dateTimeStr } from "./api-types";
import {
  BeginImportSchema,
  CancelImportSchema,
  DEFAULT_PAGE_SIZE,
  FinalizeImportSchema,
  ImportHistoryQuerySchema,
  InsertSalesChunkSchema,
  type ImportHistoryQuery,
} from "./schemas";
import { STAGING_COLS, toStagingRow } from "./staging-row";
import { CACHE_TTL_SHORT } from "./cache";
import { mapImportError } from "./import-errors";
import { attachSentryContext } from "./sentry-error-metadata";

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
      await db.query("CALL acquire_import_lock_checked(?, ?, ?, ?, ?, ?)", [
        data.batch_id,
        data.sale_date,
        context.userId,
        JSON.stringify(data.stores),
        JSON.stringify(data.products),
        data.replace_existing,
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

export interface ImportHistoryRow {
  sale_date: string;
  row_count: number;
  imported_at: string;
}

const IMPORT_HISTORY_ORDER_COLUMNS: Record<ImportHistoryQuery["sortBy"], string> = {
  sale_date: "sale_date",
  row_count: "row_count",
  imported_at: "imported_at",
};

function escapeLike(value: string) {
  return value.replaceAll("=", "==").replaceAll("%", "=%").replaceAll("_", "=_");
}

export const getImportHistory = createServerFn({ method: "POST" })
  .middleware([requireAuth, requireRateLimit()])
  .inputValidator((data: unknown) => ImportHistoryQuerySchema.parse(data ?? {}))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const {
      search = "",
      sortBy = "sale_date",
      sortDir = "desc",
      limit = DEFAULT_PAGE_SIZE,
      offset = 0,
    } = data;
    const searchValue = `%${escapeLike(search)}%`;
    const whereSql = search
      ? `WHERE (CAST(sale_date AS CHAR) LIKE ? ESCAPE '='
             OR DATE_FORMAT(sale_date, '%d/%m/%y') LIKE ? ESCAPE '='
             OR DATE_FORMAT(sale_date, '%d/%m/%Y') LIKE ? ESCAPE '='
             OR CAST(row_count AS CHAR) LIKE ? ESCAPE '='
             OR FORMAT(row_count, 0, 'de_DE') LIKE ? ESCAPE '='
             OR CAST(imported_at AS CHAR) LIKE ? ESCAPE '='
             OR DATE_FORMAT(CONVERT_TZ(imported_at, '+00:00', '-03:00'), '%d/%m/%y %H:%i') LIKE ? ESCAPE '=')`
      : "";
    const searchParams = search ? Array<string>(7).fill(searchValue) : [];
    const orderColumn = IMPORT_HISTORY_ORDER_COLUMNS[sortBy];
    const orderDirection = sortDir === "asc" ? "ASC" : "DESC";
    const [[rows], [countRows]] = await Promise.all([
      db.query(
        `SELECT sale_date, row_count, imported_at
           FROM import_log
           ${whereSql}
           ORDER BY ${orderColumn} ${orderDirection}, id DESC
           LIMIT ? OFFSET ?`,
        [...searchParams, limit, offset],
      ),
      db.query(`SELECT COUNT(*) AS total FROM import_log ${whereSql}`, searchParams),
    ]);

    const records: ImportHistoryRow[] = asArray(rows).map((row) => {
      const rec = asRecord(row);
      return {
        sale_date: str(rec.sale_date),
        row_count: num(rec.row_count),
        imported_at: dateTimeStr(rec.imported_at),
      };
    });
    const total = num(asRecord(asArray(countRows)[0]).total);
    return { records, total, limit, offset };
  });

export const finalizeImport = createServerFn({ method: "POST" })
  .middleware([requireAuth, requireRateLimit("upload")])
  .inputValidator((d: unknown) => FinalizeImportSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { cache } = await import("./cache");

    try {
      await db.query("CALL finalize_import(?, ?, ?, ?)", [
        data.batch_id,
        data.sale_date,
        data.row_count,
        context.userId,
      ]);
    } catch (error) {
      const mappedError = mapImportError(error);
      const rawMessage = error instanceof Error ? error.message : String(error);
      if (rawMessage.includes("IMPORT_ROW_COUNT_MISMATCH")) {
        let stagingRows: number | null = null;
        try {
          const [rows] = await db.query(
            "SELECT COUNT(*) AS total FROM staging_sales WHERE batch_id = ? AND sale_date = ?",
            [data.batch_id, data.sale_date],
          );
          stagingRows = num(asRecord(asArray(rows)[0]).total);
        } catch {
          // Preserve the integrity error even if its diagnostic query fails.
        }
        attachSentryContext(mappedError, "import_integrity", {
          batch_id: data.batch_id,
          sale_date: data.sale_date,
          expected_rows: data.row_count,
          staging_rows: stagingRows,
        });
      }
      throw mappedError;
    } finally {
      cache.delete("imported_dates");
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
