import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { safeError } from "./safe-error";

async function assertAdmin(ctx: { supabase: any; userId: string }) {
  const { data, error } = await ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "admin" });
  if (error) throw safeError("assertAdmin", error);
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
    if (error) throw safeError("listUsers", error);
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
    if (authErr || !created?.user) throw safeError("createUser.auth", authErr);

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
      throw safeError("createUser.insert", insErr);
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
    if (error) throw safeError("setUserRole", error);
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
    if (error) throw safeError("setUserActive", error);
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
    if (error) throw safeError("resetPassword", error);
    return { ok: true };
  });
