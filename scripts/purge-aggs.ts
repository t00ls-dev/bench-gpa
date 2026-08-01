#!/usr/bin/env bun
import db from "../src/lib/db";
import { recordHeartbeat } from "../src/lib/heartbeat";
import { RETENTION_DAYS } from "../src/lib/retention";

async function main() {
  const started = Date.now();
  console.log(`[${new Date().toISOString()}] Purge iniciado (${RETENTION_DAYS} dias)...`);
  try {
    const [rows] = await db.query("CALL purge_old_aggs(?)", [RETENTION_DAYS]);
    const deleted = Array.isArray(rows) ? ((rows[0] as { deleted?: number })?.deleted ?? 0) : 0;
    console.log(`[${new Date().toISOString()}] Purge concluído. Removidos: ${deleted}`);
    await recordHeartbeat("purge", "ok", `${deleted} registros removidos`, Date.now() - started);
    process.exit(0);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await recordHeartbeat("purge", "fail", msg, Date.now() - started);
    throw err;
  }
}

main().catch((err) => {
  console.error("Erro:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
