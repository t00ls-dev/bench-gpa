import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { safeError } from "./safe-error";

async function assertAdmin(ctx: { supabase: any; userId: string }) {
  const { data, error } = await ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "admin" });
  if (error) throw safeError("upload.assertAdmin", error, undefined, true);
  if (!data) throw new Error("Acesso negado: apenas administradores podem importar.");
}

const SaleRow = z.object({
  store_code: z.string(),
  store_name: z.string(),
  depto: z.string().nullable(),
  secao: z.string().nullable(),
  grupo: z.string().nullable(),
  subgrupo: z.string().nullable(),
  prod_code: z.string(),
  prod_name: z.string(),
  val_vda: z.number(),
});

export const beginImport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      sale_date: z.string(),
      batch_id: z.string(),
      total_rows: z.number().int().nonnegative(),
      stores: z.array(z.object({ store_code: z.string(), store_name: z.string() })),
      products: z.array(z.object({ prod_code: z.string(), prod_name: z.string() })),
    }).parse(d)
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    if (data.total_rows === 0) throw new Error("Nenhuma linha de venda para importar.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error: cleanErr } = await supabaseAdmin.from("staging_sales").delete().eq("sale_date", data.sale_date);
    if (cleanErr) throw safeError("beginImport.cleanStaging", cleanErr, "Falha ao limpar staging anterior.", true);
    if (data.stores.length) {
      const { error } = await supabaseAdmin.from("stores").upsert(data.stores, { onConflict: "store_code" });
      if (error) throw safeError("beginImport.stores", error, "Falha ao cadastrar lojas.", true);
    }
    if (data.products.length) {
      // Merge em massa via RPC: uma única chamada transacional, sem serializar
      // milhares de códigos na URL (evita erro de URI too large no PostgREST).
      const { error: upErr } = await supabaseAdmin.rpc("upsert_products_bulk", {
        p_rows: data.products,
        p_sale_date: data.sale_date,
      });
      if (upErr) throw safeError("beginImport.products.upsert", upErr, "Falha ao cadastrar produtos.", true);
    }


    return { ok: true, batch_id: data.batch_id };
  });

export const insertSalesChunk = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ sale_date: z.string(), batch_id: z.string(), rows: z.array(SaleRow) }).parse(d)
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const rows = data.rows.map((r) => ({ ...r, batch_id: data.batch_id, sale_date: data.sale_date }));
    const { error } = await supabaseAdmin.from("staging_sales").insert(rows);
    if (error) throw safeError("insertSalesChunk", error, "Falha ao inserir lote de vendas.", true);
    return { inserted: rows.length };
  });

export const finalizeImport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ sale_date: z.string(), batch_id: z.string(), row_count: z.number().int().nonnegative() }).parse(d)
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Swap atômico via RPC (valida staging, deleta aggs antigas, popula aggs direto, limpa staging, registra log)
    const { error: swapErr } = await supabaseAdmin.rpc("finalize_import", {
      p_batch_id: data.batch_id,
      p_sale_date: data.sale_date,
      p_row_count: data.row_count,
      p_imported_by: context.userId,
    });
    if (swapErr) throw safeError("finalizeImport.swap", swapErr, "Falha ao finalizar importação.", true);

    return { ok: true };
  });
