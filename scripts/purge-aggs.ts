#!/usr/bin/env bun
import db from "../src/lib/db";

async function main() {
  console.log(`[${new Date().toISOString()}] Purge iniciado...`);
  await db.query("CALL purge_old_aggs(180)");
  console.log(`[${new Date().toISOString()}] Purge concluído.`);
  process.exit(0);
}

main().catch((err) => {
  console.error("❌ Erro:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
