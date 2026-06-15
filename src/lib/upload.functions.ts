import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

async function assertAdmin(ctx: { supabase: any; userId: string }) {
  const { data, error } = await ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "admin" });
  if (error) throw new Error(error.message);
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
      stores: z.array(z.object({ store_code: z.string(), store_name: z.string() })),
      products: z.array(z.object({ prod_code: z.string(), prod_name: z.string() })),
    }).parse(d)
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error: delErr } = await supabaseAdmin.from("sales").delete().eq("sale_date", data.sale_date);
    if (delErr) throw new Error(`Erro removendo dados da data: ${delErr.message}`);
    if (data.stores.length) {
      const { error } = await supabaseAdmin.from("stores").upsert(data.stores, { onConflict: "store_code" });
      if (error) throw new Error(`Erro lojas: ${error.message}`);
    }
    if (data.products.length) {
      const { error } = await supabaseAdmin
        .from("products")
        .upsert(data.products.map((p) => ({ ...p, last_seen: data.sale_date })), { onConflict: "prod_code" });
      if (error) throw new Error(`Erro produtos: ${error.message}`);
    }
    return { ok: true };
  });

export const insertSalesChunk = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ sale_date: z.string(), rows: z.array(SaleRow) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const rows = data.rows.map((r) => ({ ...r, sale_date: data.sale_date }));
    const { error } = await supabaseAdmin.from("sales").insert(rows);
    if (error) throw new Error(error.message);
    return { inserted: rows.length };
  });

export const finalizeImport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ sale_date: z.string(), row_count: z.number().int().nonnegative() }).parse(d)
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("import_log").upsert(
      { sale_date: data.sale_date, row_count: data.row_count, imported_at: new Date().toISOString(), imported_by: context.userId },
      { onConflict: "sale_date" }
    );
    if (error) throw new Error(error.message);
    // Refresh pre-aggregated daily totals for the imported date
    const { error: aggErr } = await supabaseAdmin.rpc("refresh_sales_daily_agg", { p_date: data.sale_date });
    if (aggErr) throw new Error(`Erro ao atualizar agregação: ${aggErr.message}`);
    return { ok: true };
  });
