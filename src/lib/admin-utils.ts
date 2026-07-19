import { safeError } from "./safe-error";
import type { DB } from "./rpc-utils";

const adminCache = new Map<string, { result: boolean; expiresAt: number }>();

function isCachedAdmin(userId: string): boolean | undefined {
  const e = adminCache.get(userId);
  if (!e || Date.now() > e.expiresAt) {
    adminCache.delete(userId);
    return undefined;
  }
  return e.result;
}

function setCachedAdmin(userId: string, result: boolean): void {
  adminCache.set(userId, { result, expiresAt: Date.now() + 300_000 });
}

export async function assertAdmin(ctx: { supabase: DB; userId: string }, label = "assertAdmin") {
  const cached = isCachedAdmin(ctx.userId);
  if (cached === true) return;
  if (cached === false) throw new Error("Apenas administradores podem realizar esta ação.");

  const { data, error } = await ctx.supabase.rpc("has_role", {
    _user_id: ctx.userId,
    _role: "admin",
  });
  if (error) throw safeError(label, error, undefined, true);
  setCachedAdmin(ctx.userId, !!data);
  if (!data) throw new Error("Apenas administradores podem realizar esta ação.");
}
