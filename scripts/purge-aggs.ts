#!/usr/bin/env bun
import * as Sentry from "@sentry/node";
import "./lib/sentry-cron";
import db from "../src/lib/db";
import { recordHeartbeat } from "../src/lib/heartbeat";
import { RETENTION_DAYS } from "../src/lib/retention";

const MONITOR_SLUG = "purge-aggs";
// Schedule mirrors scripts/setup-crons.sh ("0 3 * * *"), same caveat as
// there: if the real schedule (HestiaCP in production) changes, change it
// here too, otherwise Sentry starts marking normal runs as overdue.
const MONITOR_CONFIG = {
  schedule: { type: "crontab", value: "0 3 * * *" },
  timezone: "Etc/UTC",
  checkinMargin: 15,
  maxRuntime: 30,
  failureIssueThreshold: 1,
  recoveryThreshold: 1,
} as const;

async function main() {
  const started = Date.now();
  console.log(`[${new Date().toISOString()}] Purge iniciado (${RETENTION_DAYS} dias)...`);
  try {
    const deleted = await Sentry.withMonitor(
      MONITOR_SLUG,
      async () => {
        const [rows] = await db.query("CALL purge_old_aggs(?)", [RETENTION_DAYS]);
        return Array.isArray(rows) ? ((rows[0] as { deleted?: number })?.deleted ?? 0) : 0;
      },
      MONITOR_CONFIG,
    );
    console.log(`[${new Date().toISOString()}] Purge concluído. Removidos: ${deleted}`);
    await recordHeartbeat("purge", "ok", `${deleted} registros removidos`, Date.now() - started);
    await Sentry.flush(2000);
    process.exit(0);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await recordHeartbeat("purge", "fail", msg, Date.now() - started);
    await Sentry.flush(2000);
    throw err;
  }
}

main().catch((err) => {
  console.error("Erro:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
