import { getRequest } from "@tanstack/react-start/server";
import db from "./db";
import { getClientIp } from "./rate-limit";

export interface AuditEntry {
  /** Ação no formato "dominio.verbo", ex.: "auth.login", "user.role_change". */
  action: string;
  actorId?: string | null;
  actorEmail?: string | null;
  targetType?: string | null;
  targetId?: string | null;
  /** Resumo legível do que mudou. Truncado em 500 chars. */
  detail?: string | null;
  /** IP do ator. Se omitido, tenta extrair da request atual. */
  ip?: string | null;
}

/**
 * Grava um evento na trilha de auditoria. É best-effort: NUNCA lança —
 * uma falha ao auditar não pode derrubar a operação real que a originou.
 */
export async function recordAudit(entry: AuditEntry): Promise<void> {
  try {
    let ip = entry.ip ?? null;
    if (ip == null) {
      try {
        ip = getClientIp(getRequest());
      } catch {
        ip = null;
      }
    }
    await db.query(
      `INSERT INTO audit_log (actor_id, actor_email, action, target_type, target_id, detail, ip)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        entry.actorId ?? null,
        entry.actorEmail ?? null,
        entry.action,
        entry.targetType ?? null,
        entry.targetId ?? null,
        entry.detail ? entry.detail.slice(0, 500) : null,
        ip,
      ],
    );
  } catch (err) {
    // Só loga — auditoria não deve interromper o fluxo principal.
    console.error("[audit] falha ao registrar evento:", err instanceof Error ? err.message : err);
  }
}
