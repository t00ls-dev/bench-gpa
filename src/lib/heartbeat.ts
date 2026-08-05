import db from "./db";
import { DETAIL_MAX_LENGTH } from "./audit";

export type HeartbeatStatus = "ok" | "fail";

/**
 * Records (upserts) a cron job's last run so the admin panel can show
 * whether the cron is running on schedule. Best-effort: never throws. The
 * job itself must not fail because of the heartbeat.
 */
export async function recordHeartbeat(
  job: string,
  status: HeartbeatStatus,
  detail?: string | null,
  durationMs?: number | null,
): Promise<void> {
  try {
    await db.query(
      `INSERT INTO cron_heartbeat (job, last_run_at, last_status, last_detail, last_duration_ms)
       VALUES (?, NOW(), ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         last_run_at = NOW(),
         last_status = VALUES(last_status),
         last_detail = VALUES(last_detail),
         last_duration_ms = VALUES(last_duration_ms)`,
      [job, status, detail ? detail.slice(0, DETAIL_MAX_LENGTH) : null, durationMs ?? null],
    );
  } catch (err) {
    console.error(
      "[heartbeat] falha ao registrar:",
      err instanceof Error ? err.message : String(err),
    );
  }
}
