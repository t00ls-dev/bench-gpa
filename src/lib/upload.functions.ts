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
    if (cleanErr) throw safeError("beginImport.cleanStaging", cleanErr, "Falha ao limpar staging anterior.");
    if (data.stores.length) {
      const { error } = await supabaseAdmin.from("stores").upsert(data.stores, { onConflict: "store_code" });
      if (error) throw safeError("beginImport.stores", error, "Falha ao cadastrar lojas.");
    }
    if (data.products.length) {
      const { error } = await supabaseAdmin
        .from("products")
        .upsert(data.products.map((p) => ({ ...p, last_seen: data.sale_date })), { onConflict: "prod_code" });
      if (error) throw safeError("beginImport.products", error, "Falha ao cadastrar produtos.");
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
    if (error) throw safeError("insertSalesChunk", error, "Falha ao inserir lote de vendas.");
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

    // 1) Swap atômico via RPC (valida staging, deleta dados antigos, insere novos, registra log)
    const { error: swapErr } = await supabaseAdmin.rpc("finalize_import", {
      p_batch_id: data.batch_id,
      p_sale_date: data.sale_date,
      p_row_count: data.row_count,
      p_imported_by: context.userId,
    });
    if (swapErr) throw safeError("finalizeImport.swap", swapErr, "Falha ao finalizar importação.");

    // 2) Tenta refresh da agg via RPC
    const { error: aggErr } = await supabaseAdmin.rpc("refresh_sales_daily_agg", { p_date: data.sale_date });
    if (!aggErr) {
      const { error: hierErr } = await supabaseAdmin.rpc("refresh_filter_hierarchy");
      if (hierErr) console.error("[finalizeImport] refresh_filter_hierarchy failed:", hierErr);
      return { ok: true };
    }

    // 3) Se falhou, faz passo a passo
    console.error("[finalizeImport] refresh_sales_daily_agg failed, stepping manually:", aggErr);

    const { error: delErr } = await supabaseAdmin.from("sales_daily_agg").delete().eq("sale_date", data.sale_date);
    if (delErr) throw safeError("finalizeImport.delAgg", delErr, "Falha ao limpar agregados antigos.");

    const { data: salesRows, error: queryErr } = await supabaseAdmin
      .from("sales")
      .select("store_code, store_name, depto, secao, grupo, subgrupo, val_vda")
      .eq("sale_date", data.sale_date);
    if (queryErr) throw safeError("finalizeImport.querySales", queryErr, "Falha ao consultar vendas para agregação.");

    if (salesRows && salesRows.length > 0) {
      interface AggRow {
        sale_date: string;
        store_code: string;
        store_name: string;
        depto: string | null;
        secao: string | null;
        grupo: string | null;
        subgrupo: string | null;
        val_vda: number;
        item_count: number;
      }
      const grouped = new Map<string, AggRow>();
      for (const r of salesRows) {
        const key = `${r.store_code}|${r.depto ?? ""}|${r.secao ?? ""}|${r.grupo ?? ""}|${r.subgrupo ?? ""}`;
        const g = grouped.get(key);
        if (g) {
          g.val_vda = Number(g.val_vda) + Number(r.val_vda);
          g.item_count += 1;
        } else {
          grouped.set(key, {
            sale_date: data.sale_date,
            store_code: r.store_code,
            store_name: r.store_name,
            depto: r.depto,
            secao: r.secao,
            grupo: r.grupo,
            subgrupo: r.subgrupo,
            val_vda: Number(r.val_vda),
            item_count: 1,
          });
        }
      }
      const { error: insErr } = await supabaseAdmin.from("sales_daily_agg").insert(Array.from(grouped.values()));
      if (insErr) throw safeError("finalizeImport.insAgg", insErr, "Falha ao inserir agregados.");
    }

    const { error: hierErr } = await supabaseAdmin.rpc("refresh_filter_hierarchy");
    if (hierErr) throw safeError("finalizeImport.hierarchy", hierErr, "Falha ao atualizar hierarquia de filtros.");

    return { ok: true };
  });
