import { createServerFn } from "@tanstack/react-start";
import { requireAuth } from "./auth-middleware";
import { requireRateLimit } from "./rate-limit.middleware";
import { z } from "zod";
import { assertAdmin } from "./admin-utils";
import db from "./db";
import { asArray, asRecord, str, num, dateTimeStr } from "./api-types";
import { SaleRowSchema } from "./schemas";
import { STAGING_COLS, toStagingRow } from "./staging-row";

export const beginImport = createServerFn({ method: "POST" })
  .middleware([requireAuth, requireRateLimit("upload")])
  .inputValidator((d: unknown) =>
    z
      .object({
        sale_date: z.string(),
        batch_id: z.string(),
        total_rows: z.number().int().nonnegative(),
        stores: z.array(z.object({ store_code: z.string(), store_name: z.string() })),
        products: z.array(z.object({ prod_code: z.string(), prod_name: z.string() })),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context, "upload.assertAdmin");
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
  .inputValidator((d: unknown) =>
    z
      .object({ sale_date: z.string(), batch_id: z.string(), rows: z.array(SaleRowSchema) })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context, "upload.assertAdmin");

    // Layout e defaults vêm de staging-row.ts, o mesmo módulo que o import via
    // CLI usa. Esta função mantinha uma cópia própria da lista de colunas — foi
    // exatamente essa duplicação que deixou os dois caminhos divergirem antes
    // (o CLI com `?? 0`, este com `?? null`), e o `?? 0` transformava categoria
    // nula na string "0". Uma fonte só elimina a classe do problema.
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
      60_000,
    );
  });

export const finalizeImport = createServerFn({ method: "POST" })
  .middleware([requireAuth, requireRateLimit("upload")])
  .inputValidator((d: unknown) =>
    z
      .object({
        sale_date: z.string(),
        batch_id: z.string(),
        row_count: z.number().int().nonnegative(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context, "upload.assertAdmin");

    await db.query("CALL finalize_import(?, ?, ?, ?)", [
      data.batch_id,
      data.sale_date,
      data.row_count,
      context.userId,
    ]);

    return { ok: true };
  });
