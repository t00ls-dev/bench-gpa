#!/usr/bin/env bun
import db from "../src/lib/db";
import { recordHeartbeat } from "../src/lib/heartbeat";

async function main() {
  const started = Date.now();
  console.log(
    `[${new Date().toISOString()}] Refresh de product_universe/filter_hierarchy iniciado...`,
  );
  try {
    await db.query("CALL refresh_product_universe()");
    await db.query("CALL refresh_filter_hierarchy()");
    console.log(`[${new Date().toISOString()}] Refresh concluído.`);
    await recordHeartbeat("refresh-universe", "ok", null, Date.now() - started);
    process.exit(0);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await recordHeartbeat("refresh-universe", "fail", msg, Date.now() - started);
    throw err;
  }
}

main().catch((err) => {
  console.error("Erro:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
