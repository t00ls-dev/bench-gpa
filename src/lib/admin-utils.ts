import { safeError } from "./safe-error";
import db from "./db";

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

export async function assertAdmin(ctx: { userId: string }, label = "assertAdmin") {
  const cached = isCachedAdmin(ctx.userId);
  if (cached === true) return;
  if (cached === false) throw new Error("Apenas administradores podem realizar esta ação.");

  const [rows] = await db.query("CALL has_role(?, ?)", [ctx.userId, "admin"]);
  const data = (rows as any[])[0]?.[0]?.has_role ?? false;
  setCachedAdmin(ctx.userId, !!data);
  if (!data) throw new Error("Apenas administradores podem realizar esta ação.");
}
