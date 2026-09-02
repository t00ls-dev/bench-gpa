import { asArray, asRecord } from "./api-types";
import db from "./db";
import { CACHE_TTL_LONG } from "./cache";
import { ADMIN_ROLE } from "./roles";

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
  adminCache.set(userId, { result, expiresAt: Date.now() + CACHE_TTL_LONG });
}

/**
 * Discards a user's cached verdict. Must be called whenever `role` or
 * `is_active` change: `has_role` filters on both, so both affect the result.
 *
 * Without this the 5min TTL cut both ways: a demoted or deactivated admin
 * kept the privilege for up to 5 minutes, and (the one that showed up more
 * in daily use) promoting someone to admin had no effect during that
 * window, because the `false` was cached too.
 */
export function invalidateAdminCache(userId: string): void {
  adminCache.delete(userId);
}

export async function assertAdmin(ctx: { userId: string }) {
  const cached = isCachedAdmin(ctx.userId);
  if (cached === true) return;
  if (cached === false) throw new Error("Apenas administradores podem realizar esta ação.");

  const [rows] = await db.query("CALL has_role(?, ?)", [ctx.userId, ADMIN_ROLE]);
  const data = asRecord(asArray(asArray(rows)[0])[0]).has_role ?? false;
  setCachedAdmin(ctx.userId, !!data);
  if (!data) throw new Error("Apenas administradores podem realizar esta ação.");
}
