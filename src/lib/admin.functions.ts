import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { safeError } from "./safe-error";

async function assertAdmin(ctx: { supabase: any; userId: string }) {
  const { data, error } = await ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "admin" });
  if (error) throw safeError("assertAdmin", error);
  if (!data) throw new Error("Apenas administradores.");
}

export const listUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: profiles, error } = await supabaseAdmin
      .from("profiles")
      .select("id, email, status, created_at")
      .order("created_at", { ascending: false });
    if (error) throw safeError("listUsers", error);
    const { data: roles } = await supabaseAdmin.from("user_roles").select("user_id, role");
    const rmap = new Map<string, string[]>();
    (roles ?? []).forEach((r) => {
      const a = rmap.get(r.user_id) ?? [];
      a.push(r.role);
      rmap.set(r.user_id, a);
    });
    return (profiles ?? []).map((p) => ({ ...p, roles: rmap.get(p.id) ?? [] }));
  });

export const setUserStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({
      userId: z.string().uuid(),
      status: z.enum(["pending", "approved", "blocked"]),
    }).parse(data)
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ status: data.status })
      .eq("id", data.userId);
    if (error) throw safeError("setUserStatus", error);
    return { ok: true };
  });

export const setUserRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({
      userId: z.string().uuid(),
      role: z.enum(["admin", "user"]),
      grant: z.boolean(),
    }).parse(data)
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    if (context.userId === data.userId && data.role === "admin" && !data.grant) {
      throw new Error("Você não pode remover o próprio acesso de administrador.");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (data.grant) {
      const { error } = await supabaseAdmin
        .from("user_roles")
        .upsert({ user_id: data.userId, role: data.role }, { onConflict: "user_id,role" });
      if (error) throw safeError("setUserRole.grant", error);
    } else {
      const { error } = await supabaseAdmin
        .from("user_roles")
        .delete()
        .eq("user_id", data.userId)
        .eq("role", data.role);
      if (error) throw safeError("setUserRole.revoke", error);
    }
    return { ok: true };
  });
