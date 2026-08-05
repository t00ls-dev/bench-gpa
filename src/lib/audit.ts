import { getRequest } from "@tanstack/react-start/server";
import db from "./db";
import { getClientIp } from "./rate-limit";

/**
 * `detail` field limit. Mirrors `VARCHAR(500)` in the schema, both in
 * `audit_log` and `cron_heartbeat`, which used the same 500 hand-written in
 * different files. Truncating here keeps a long detail from failing the
 * whole write with "Data too long".
 */
export const DETAIL_MAX_LENGTH = 500;

export interface AuditEntry {
  /** Action in "domain.verb" format, e.g. "auth.login", "user.role_change". */
  action: string;
  actorId?: string | null;
  actorUsername?: string | null;
  targetType?: string | null;
  targetId?: string | null;
  /** Human-readable summary of what changed. Truncated to 500 chars. */
  detail?: string | null;
  /** Actor's IP. If omitted, tries to extract it from the current request. */
  ip?: string | null;
}

/**
 * Records an event in the audit trail. Best-effort: NEVER throws. A failure
 * to audit can't take down the real operation that triggered it.
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
      `INSERT INTO audit_log (actor_id, actor_username, action, target_type, target_id, detail, ip)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        entry.actorId ?? null,
        entry.actorUsername ?? null,
        entry.action,
        entry.targetType ?? null,
        entry.targetId ?? null,
        entry.detail ? entry.detail.slice(0, DETAIL_MAX_LENGTH) : null,
        ip,
      ],
    );
  } catch (err) {
    // Only logs: auditing must not interrupt the main flow.
    console.error("[audit] falha ao registrar evento:", err instanceof Error ? err.message : err);
  }
}
