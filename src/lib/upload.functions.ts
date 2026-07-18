import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireRateLimit } from "./rate-limit.middleware";
import { z } from "zod";
import { safeError } from "./safe-error";
import { assertAdmin } from "./admin-utils";
import { DB } from "./rpc-utils";
import { SaleRowSchema } from "./schemas";

export const beginImport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireRateLimit])
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
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error: cleanErr } = await supabaseAdmin
      .from("staging_sales")
      .delete()
      .eq("sale_date", data.sale_date);
    if (cleanErr)
      throw safeError(
        "beginImport.cleanStaging",
        cleanErr,
        "Falha ao limpar staging anterior.",
        true,
      );
    if (data.stores.length) {
      const { error } = await supabaseAdmin
        .from("stores")
        .upsert(data.stores, { onConflict: "store_code" });
      if (error) throw safeError("beginImport.stores", error, "Falha ao cadastrar lojas.", true);
    }
    if (data.products.length) {
      // Merge em massa via RPC: uma única chamada transacional, sem serializar
      // milhares de códigos na URL (evita erro de URI too large no PostgREST).
      const { error: upErr } = await supabaseAdmin.rpc("upsert_products_bulk", {
        p_rows: data.products,
        p_sale_date: data.sale_date,
      });
      if (upErr)
        throw safeError("beginImport.products.upsert", upErr, "Falha ao cadastrar produtos.", true);
    }

    return { ok: true, batch_id: data.batch_id };
  });

export const insertSalesChunk = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireRateLimit])
  .inputValidator((d: unknown) =>
    z.object({ sale_date: z.string(), batch_id: z.string(), rows: z.array(SaleRowSchema) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context, "upload.assertAdmin");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const rows = data.rows.map((r) => ({
      ...r,
      batch_id: data.batch_id,
      sale_date: data.sale_date,
    }));
    const { error } = await supabaseAdmin.from("staging_sales").insert(rows);
    if (error) throw safeError("insertSalesChunk", error, "Falha ao inserir lote de vendas.", true);
    return { inserted: rows.length };
  });

export const getImportedDates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth, requireRateLimit])
  .handler(async ({ context }) => {
    const { cache } = await import("./cache");
    const supabase = context.supabase as DB;
    return cache.wrap("imported_dates", async () => {
      const { data, error } = await supabase.rpc("imported_dates");
      if (error) throw safeError("analytics", error);
      return (data ?? []) as { sale_date: string; row_count: number; imported_at: string }[];
    }, 60_000);
  });

export const finalizeImport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireRateLimit])
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
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Swap atômico via RPC (valida staging, deleta aggs antigas, popula aggs direto, limpa staging, registra log)
    const { error: swapErr } = await supabaseAdmin.rpc("finalize_import", {
      p_batch_id: data.batch_id,
      p_sale_date: data.sale_date,
      p_row_count: data.row_count,
      p_imported_by: context.userId,
    });
    if (swapErr)
      throw safeError("finalizeImport.swap", swapErr, "Falha ao finalizar importação.", true);

    return { ok: true };
  });
