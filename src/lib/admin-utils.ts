import { asArray, asRecord } from "./api-types";
import db from "./db";
import { CACHE_TTL_LONG } from "./cache";

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
 * Descarta o veredito cacheado de um usuário. Precisa ser chamado sempre que
 * `role` ou `is_active` mudarem — `has_role` filtra pelos dois, então ambos
 * alteram o resultado.
 *
 * Sem isso o TTL de 5 min valia nos dois sentidos: um admin rebaixado ou
 * inativado seguia com privilégio por até 5 minutos, e — o que aparecia bem
 * mais no uso diário — promover alguém a admin não surtia efeito nenhum
 * durante esse tempo, porque o `false` também ficava cacheado.
 *
 * O cache é por processo. Hoje o PM2 roda `instances: 1` em modo fork, então há
 * um só; se um dia virar cluster, isto precisa virar invalidação compartilhada
 * (o TTL de 5 min continua sendo o piso de garantia).
 */
export function invalidateAdminCache(userId: string): void {
  adminCache.delete(userId);
}

export async function assertAdmin(ctx: { userId: string }) {
  const cached = isCachedAdmin(ctx.userId);
  if (cached === true) return;
  if (cached === false) throw new Error("Apenas administradores podem realizar esta ação.");

  const [rows] = await db.query("CALL has_role(?, ?)", [ctx.userId, "admin"]);
  const data = asRecord(asArray(asArray(rows)[0])[0]).has_role ?? false;
  setCachedAdmin(ctx.userId, !!data);
  if (!data) throw new Error("Apenas administradores podem realizar esta ação.");
}
