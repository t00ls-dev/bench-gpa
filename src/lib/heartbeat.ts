import db from "./db";
import { DETAIL_MAX_LENGTH } from "./audit";

export type HeartbeatStatus = "ok" | "fail";

/**
 * Registra (upsert) o último run de um job de cron para o painel admin
 * conseguir mostrar se a cron está rodando dentro do prazo.
 * Best-effort: nunca lança — o job em si não deve falhar por causa do heartbeat.
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
