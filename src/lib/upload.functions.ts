import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { parseWorkbook } from "./xlsx-parser";

async function assertAdminAndApproved(ctx: { supabase: any; userId: string }) {
  const { data, error } = await ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "admin" });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Acesso negado: apenas administradores podem importar.");
}

export const uploadSheet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ filename: z.string(), base64: z.string() }).parse(data)
  )
  .handler(async ({ data, context }) => {
    await assertAdminAndApproved(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const buf = Buffer.from(data.base64, "base64");
    const parsed = parseWorkbook(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));

    // Replace existing data for this date
    const { error: delErr } = await supabaseAdmin.from("sales").delete().eq("sale_date", parsed.sale_date);
    if (delErr) throw new Error(`Erro removendo dados da data: ${delErr.message}`);

    // Insert sales in chunks
    const rows = parsed.sales.map((s) => ({ ...s, sale_date: parsed.sale_date }));
    const chunkSize = 1000;
    for (let i = 0; i < rows.length; i += chunkSize) {
      const chunk = rows.slice(i, i + chunkSize);
      const { error } = await supabaseAdmin.from("sales").insert(chunk);
      if (error) throw new Error(`Erro inserindo vendas (chunk ${i}): ${error.message}`);
    }

    // Upsert stores and products
    if (parsed.stores.length) {
      await supabaseAdmin.from("stores").upsert(parsed.stores, { onConflict: "store_code" });
    }
    if (parsed.products.length) {
      await supabaseAdmin.from("products").upsert(
        parsed.products.map((p) => ({ ...p, last_seen: parsed.sale_date })),
        { onConflict: "prod_code" }
      );
    }

    return {
      filename: data.filename,
      sale_date: parsed.sale_date,
      rows: rows.length,
      stores: parsed.stores.length,
      products: parsed.products.length,
    };
  });
