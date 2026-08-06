#!/usr/bin/env bun
import * as Sentry from "@sentry/node";
import "./lib/sentry-cron";
import db from "../src/lib/db";
import { recordHeartbeat } from "../src/lib/heartbeat";

const MONITOR_SLUG = "refresh-universe";
// Schedule mirrors scripts/setup-crons.sh ("30 3 * * *"), same caveat as
// there: if the real schedule (HestiaCP in production) changes, change it
// here too, otherwise Sentry starts marking normal runs as overdue.
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
    `[${new Date().toISOString()}] Refresh of product_universe/filter_hierarchy started...`,
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
    console.log(`[${new Date().toISOString()}] Refresh complete.`);
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
  console.error("Error:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
