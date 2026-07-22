import { createServerFn } from "@tanstack/react-start";
import { requireAuth } from "./auth-middleware";
import { requireRateLimit } from "./rate-limit.middleware";
import { z } from "zod";
import { assertAdmin } from "./admin-utils";
import db from "./db";
import { asArray, asRecord, str, num, dateTimeStr } from "./api-types";
import { SaleRowSchema } from "./schemas";

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

    const rows = data.rows.map((r) => ({
      ...r,
      batch_id: data.batch_id,
      sale_date: data.sale_date,
    }));

    const columns = [
      "sale_date",
      "batch_id",
      "store_code",
      "store_name",
      "prod_code",
      "prod_name",
      "depto",
      "secao",
      "grupo",
      "subgrupo",
      "val_vda",
      "qty_vda",
      "val_cus",
      "qty_cus",
      "val_dev",
      "qty_dev",
      "val_vda_liq",
      "qty_vda_liq",
      "val_cus_liq",
      "qty_cus_liq",
      "val_sld",
      "qty_sld",
      "per_mrg",
    ];

    const placeholders = rows.map(() => `(${columns.map(() => "?").join(", ")})`).join(", ");
    const values = rows.flatMap((r) =>
      columns.map((c) => (r as Record<string, unknown>)[c] ?? null),
    );

    await db.query(
      `INSERT INTO staging_sales (${columns.join(", ")}) VALUES ${placeholders}`,
      values,
    );

    return { inserted: rows.length };
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
