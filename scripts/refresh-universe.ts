#!/usr/bin/env bun
import * as Sentry from "@sentry/node";
import "./lib/sentry-cron";
import db from "../src/lib/db";
import { recordHeartbeat } from "../src/lib/heartbeat";

const MONITOR_SLUG = "refresh-universe";
// Schedule espelha scripts/setup-crons.sh ("30 3 * * *"), mesma ressalva de
// lá: se o horário real (HestiaCP em produção) mudar, mudar aqui também,
// senão o Sentry passa a marcar execuções normais como atrasadas.
const MONITOR_CONFIG = {
  schedule: { type: "crontab", value: "30 3 * * *" },
  timezone: "Etc/UTC",
  checkinMargin: 15,
  maxRuntime: 15,
  failureIssueThreshold: 1,
  recoveryThreshold: 1,
} as const;

async function main() {
  const started = Date.now();
  console.log(
    `[${new Date().toISOString()}] Refresh de product_universe/filter_hierarchy iniciado...`,
  );
  try {
    await Sentry.withMonitor(
      MONITOR_SLUG,
      async () => {
        await db.query("CALL refresh_product_universe()");
        await db.query("CALL refresh_filter_hierarchy()");
      },
      MONITOR_CONFIG,
    );
    console.log(`[${new Date().toISOString()}] Refresh concluído.`);
    await recordHeartbeat("refresh-universe", "ok", null, Date.now() - started);
    await Sentry.flush(2000);
    process.exit(0);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await recordHeartbeat("refresh-universe", "fail", msg, Date.now() - started);
    await Sentry.flush(2000);
    throw err;
  }
}

main().catch((err) => {
  console.error("Erro:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
