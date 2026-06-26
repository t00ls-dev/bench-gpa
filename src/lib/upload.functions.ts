import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { safeError } from "./safe-error";

async function assertAdmin(ctx: { supabase: any; userId: string }) {
  const { data, error } = await ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "admin" });
  if (error) throw safeError("upload.assertAdmin", error);
  if (!data) throw new Error("Acesso negado: apenas administradores podem importar.");
}

const SaleRow = z.object({
  store_code: z.string(),
  prod_code: z.string(),
  val_vda: z.number(),
});

export const beginImport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      sale_date: z.string(),
      stores: z.array(z.object({ store_code: z.string(), store_name: z.string() })),
      products: z.array(z.object({
        prod_code: z.string(),
        prod_name: z.string(),
        depto:     z.string().nullable(),
        secao:     z.string().nullable(),
        grupo:     z.string().nullable(),
        subgrupo:  z.string().nullable(),
      })),
    }).parse(d)
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error: delErr } = await supabaseAdmin.from("sales").delete().eq("sale_date", data.sale_date);
    if (delErr) throw safeError("beginImport.delete", delErr);
    if (data.stores.length) {
      const { error } = await supabaseAdmin.from("stores").upsert(data.stores, { onConflict: "store_code" });
      if (error) throw safeError("beginImport.stores", error);
    }
    if (data.products.length) {
      const { error } = await supabaseAdmin
        .from("products")
        .upsert(data.products.map((p) => ({ ...p, last_seen: data.sale_date })) as any, { onConflict: "prod_code" });
      if (error) throw safeError("beginImport.products", error);
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
    if (error) throw safeError("insertSalesChunk", error);
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
    const { error } = await supabaseAdmin.from("import_log").insert(
      { sale_date: data.sale_date, row_count: data.row_count, imported_at: new Date().toISOString(), imported_by: context.userId }
    );
    if (error) throw safeError("finalizeImport.log", error);
    const { error: aggErr } = await supabaseAdmin.rpc("refresh_sales_daily_agg", { p_date: data.sale_date });
    if (aggErr) throw safeError("finalizeImport.agg", aggErr);
    return { ok: true };
  });
