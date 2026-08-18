import { createServerFn } from "@tanstack/react-start";
import { requireAuth } from "./auth-middleware";
import { requireRateLimit } from "./rate-limit.middleware";
import { assertAdmin } from "./admin-utils";
import db from "./db";
import { asArray, asRecord, str, num, dateTimeStr } from "./api-types";
import { BeginImportSchema, FinalizeImportSchema, InsertSalesChunkSchema } from "./schemas";
import { STAGING_COLS, toStagingRow } from "./staging-row";
import { CACHE_TTL_SHORT } from "./cache";

export const beginImport = createServerFn({ method: "POST" })
  .middleware([requireAuth, requireRateLimit("upload")])
  .inputValidator((d: unknown) => BeginImportSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    if (data.total_rows === 0) throw new Error("Nenhuma linha de venda para importar.");

    await db.query("DELETE FROM staging_sales WHERE sale_date = ?", [data.sale_date]);

    if (data.stores.length) {
      const placeholders = data.stores.map(() => "(?, ?)").join(", ");
      const values = data.stores.flatMap((s) => [s.store_code, s.store_name]);
      await db.query(
        `INSERT INTO stores (store_code, store_name) VALUES ${placeholders} ON DUPLICATE KEY UPDATE store_name = VALUES(store_name)`,
        values,
      );
    }

    if (data.products.length) {
      await db.query("CALL upsert_products_bulk(?, ?)", [
        JSON.stringify(data.products),
        data.sale_date,
      ]);
    }

    return { ok: true, batch_id: data.batch_id };
  });

export const insertSalesChunk = createServerFn({ method: "POST" })
  .middleware([requireAuth, requireRateLimit("upload")])
  .inputValidator((d: unknown) => InsertSalesChunkSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);

    // Layout and defaults come from staging-row.ts, the same module the CLI
    // import uses. This function used to keep its own copy of the column
    // list: that exact duplication is what let the two paths diverge before
    // (the CLI with `?? 0`, this one with `?? null`), and the `?? 0` turned
    // a null category into the string "0". A single source eliminates that
    // whole class of bug.
    const placeholders = data.rows
      .map(() => `(${STAGING_COLS.map(() => "?").join(", ")})`)
      .join(", ");
    const values = data.rows.flatMap((r) =>
      toStagingRow(r as Record<string, unknown>, data.batch_id, data.sale_date),
    );

    await db.query(
      `INSERT INTO staging_sales (${STAGING_COLS.join(", ")}) VALUES ${placeholders}`,
      values,
    );

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

    await db.query("CALL finalize_import(?, ?, ?, ?)", [
      data.batch_id,
      data.sale_date,
      data.row_count,
      context.userId,
    ]);

    return { ok: true };
  });
