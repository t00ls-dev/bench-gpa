import { safeError } from "./safe-error";

export async function assertAdmin(ctx: { supabase: any; userId: string }, label = "assertAdmin") {
  const { data, error } = await ctx.supabase.rpc("has_role", {
    _user_id: ctx.userId,
    _role: "admin",
  });
  if (error) throw safeError(label, error, undefined, true);
  if (!data) throw new Error("Apenas administradores podem realizar esta ação.");
}
