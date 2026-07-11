import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { safeError } from "./safe-error";

async function assertAdmin(ctx: { supabase: any; userId: string }) {
  const { data, error } = await ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "admin" });
  if (error) throw safeError("assertAdmin", error, undefined, true);
  if (!data) throw new Error("Apenas administradores.");
}

const emailSchema = z.string().trim().toLowerCase()
  .regex(/^[a-z0-9._-]+@gpabr\.com$/i, "E-mail deve terminar em @gpabr.com");
const passwordSchema = z.string().min(8, "Senha deve ter ao menos 8 caracteres").max(128);

export const listUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("users")
      .select("id, email, name, role, is_active, created_at")
      .order("created_at", { ascending: false });
    if (error) throw safeError("listUsers", error, "Ocorreu um erro interno. Tente novamente.", true);
    return data ?? [];
  });

export const createUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({
      email: emailSchema,
      name: z.string().trim().min(1, "Nome obrigatório").max(120),
      password: passwordSchema,
      role: z.enum(["admin", "user"]),
    }).parse(data)
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: created, error: authErr } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
    });
    if (authErr || !created?.user) throw safeError("createUser.auth", authErr, "Falha ao criar usuário.", true);

    const { error: insErr } = await supabaseAdmin.from("users").insert({
      id: created.user.id,
      email: data.email,
      name: data.name,
      role: data.role,
      is_active: true,
    });
    if (insErr) {
      // rollback: apaga auth user órfão
      await supabaseAdmin.auth.admin.deleteUser(created.user.id).catch(() => {});
      throw safeError("createUser.insert", insErr, "Falha ao salvar usuário.", true);
    }
    return { ok: true, id: created.user.id };
  });

export const setUserRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({
      userId: z.string().uuid(),
      role: z.enum(["admin", "user"]),
    }).parse(data)
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    if (context.userId === data.userId && data.role !== "admin") {
      throw new Error("Você não pode remover seu próprio acesso de administrador.");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("users")
      .update({ role: data.role })
      .eq("id", data.userId);
    if (error) throw safeError("setUserRole", error, "Ocorreu um erro interno. Tente novamente.", true);
    return { ok: true };
  });

export const setUserActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({
      userId: z.string().uuid(),
      isActive: z.boolean(),
    }).parse(data)
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    if (context.userId === data.userId && !data.isActive) {
      throw new Error("Você não pode inativar sua própria conta.");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("users")
      .update({ is_active: data.isActive })
      .eq("id", data.userId);
    if (error) throw safeError("setUserActive", error, "Ocorreu um erro interno. Tente novamente.", true);
    return { ok: true };
  });

export const resetPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({
      userId: z.string().uuid(),
      password: passwordSchema,
    }).parse(data)
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.userId, {
      password: data.password,
    });
    if (error) throw safeError("resetPassword", error, "Ocorreu um erro interno. Tente novamente.", true);
    return { ok: true };
  });

type TableName = "sales" | "sales_daily_agg" | "products" | "stores" | "filter_hierarchy" | "import_log";

async function countRows(sa: Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"], table: TableName) {
  const { count, error } = await sa.from(table).select("*", { count: "exact", head: true });
  if (error) throw safeError(`count.${table}`, error, undefined, true);
  return count ?? 0;
}

async function fetchDistinctDates(sa: Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"], table: TableName, column: string) {
  const { data, error } = await sa.from(table).select(column);
  if (error) throw safeError(`distinct.${table}.${column}`, error, undefined, true);
  const vals = [...new Set((data ?? []).map((r) => String((r as unknown as Record<string, unknown>)[column])))].sort();
  return vals;
}

export const diagnoseData = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const tables: TableName[] = ["sales", "sales_daily_agg", "products", "stores", "filter_hierarchy", "import_log"];
    const counts: Record<string, number> = {};
    for (const t of tables) {
      counts[t] = await countRows(supabaseAdmin, t);
    }
    const datesInSales = await fetchDistinctDates(supabaseAdmin, "sales", "sale_date");
    return { ...counts, dates_in_sales: datesInSales };
  });

export const repairAggregations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Busca datas distintas de public.sales
    const dates = await fetchDistinctDates(supabaseAdmin, "sales", "sale_date");
    if (dates.length === 0) {
      return { ok: false, message: "Nenhuma data encontrada em public.sales" };
    }

    let refreshed = 0;
    let errors = 0;

    for (const dateStr of dates) {
      try {
        // Deleta agregação existente para a data
        await supabaseAdmin.from("sales_daily_agg").delete().eq("sale_date", dateStr);

        // Busca vendas brutas da data
        const { data: rows, error: qErr } = await supabaseAdmin
          .from("sales")
          .select("store_code, store_name, depto, secao, grupo, subgrupo, val_vda")
          .eq("sale_date", dateStr);
        if (qErr) throw qErr;
        if (!rows || rows.length === 0) continue;

        // Agrupa por store_code + depto + secao + grupo + subgrupo
        const grouped = new Map<string, {
          store_code: string; store_name: string;
          depto: string | null; secao: string | null; grupo: string | null; subgrupo: string | null;
          val_vda: number; item_count: number;
        }>();
        for (const r of rows) {
          const key = `${r.store_code}|${r.depto ?? ""}|${r.secao ?? ""}|${r.grupo ?? ""}|${r.subgrupo ?? ""}`;
          const g = grouped.get(key);
          if (g) {
            g.val_vda += Number(r.val_vda);
            g.item_count += 1;
          } else {
            grouped.set(key, {
              store_code: r.store_code, store_name: r.store_name,
              depto: r.depto, secao: r.secao, grupo: r.grupo, subgrupo: r.subgrupo,
              val_vda: Number(r.val_vda), item_count: 1,
            });
          }
        }

        // Insere agregados
        const { error: iErr } = await supabaseAdmin.from("sales_daily_agg").insert(
          Array.from(grouped.values()).map((g) => ({ ...g, sale_date: dateStr }))
        );
        if (iErr) throw iErr;
        refreshed++;
      } catch (e) {
        console.error(`[repair] erro na data ${dateStr}:`, e);
        errors++;
      }
    }

    // Atualiza hierarquia de filtros
    const { error: hErr } = await supabaseAdmin.rpc("refresh_filter_hierarchy");
    if (hErr) console.error("[repair] refresh_filter_hierarchy failed:", hErr);

    return {
      ok: true,
      dates_refreshed: refreshed,
      errors,
      total_dates: dates.length,
      hierarchy_refreshed: !hErr,
    };
  });
