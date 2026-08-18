#!/usr/bin/env bun
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { parseAnyWorkbook } from "../src/lib/xlsx-parser";
import { STAGING_COLS, toStagingRow } from "../src/lib/staging-row";
import db from "../src/lib/db";
import { IMPORT_CHUNK_SIZE } from "../src/lib/import-config";
import { parseImportChunkSize } from "../src/lib/import-cli";

function parseArgs() {
  const args = process.argv.slice(2);
  if (args.length === 0 || args.includes("--help")) {
    console.log(`
Usage: bun run scripts/import.ts <file.xlsx> [options]

Options:
  --user-id UUID     ID of the user performing the import
  --chunk-size N     Rows per batch, 1-${IMPORT_CHUNK_SIZE} (default ${IMPORT_CHUNK_SIZE})
  --help             Show this message
`);
    process.exit(0);
  }

  const filePath = args.find((a) => !a.startsWith("--"))!;
  const userId = extractArg(args, "--user-id");
  const chunkSize = parseImportChunkSize(args);

  return { filePath, userId, chunkSize };
}

function extractArg(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag);
  if (idx === -1 || idx + 1 >= args.length) return undefined;
  return args[idx + 1];
}

async function main() {
  const { filePath, userId, chunkSize } = parseArgs();

  console.log(`Reading ${filePath}...`);
  const buffer = readFileSync(filePath).buffer;
  const parsed = parseAnyWorkbook(buffer);
  console.log(`   Date: ${parsed.sale_date}`);
  console.log(`   Sales: ${parsed.sales.length}`);
  console.log(`   Stores: ${parsed.stores.length}`);
  console.log(`   Products: ${parsed.products.length}`);

  const batchId = randomUUID();
  const totalRows = parsed.sales.length;

  // Same check as upload.functions.ts:beginImport: a file with the date
  // marker but zero product rows (an empty spreadsheet, exported wrong)
  // would arrive here intact and only blow up inside finalize_import
  // (SIGNAL SQLSTATE '45000' from staging_count=0), a raw database error
  // instead of this message.
  if (totalRows === 0) {
    throw new Error("No sale rows to import.");
  }

  // ---- beginImport ----
  console.log(`\nStarting import (batch ${batchId})...`);
  await db.query("DELETE FROM staging_sales WHERE sale_date = ?", [parsed.sale_date]);
  console.log("   OK: staging cleared");

  if (parsed.stores.length) {
    const ph = parsed.stores.map(() => "(?, ?)").join(", ");
    const vals = parsed.stores.flatMap((s) => [s.store_code, s.store_name]);
    await db.query(
      `INSERT INTO stores (store_code, store_name) VALUES ${ph} ON DUPLICATE KEY UPDATE store_name = VALUES(store_name)`,
      vals,
    );
    console.log(`   OK: ${parsed.stores.length} stores`);
  }

  if (parsed.products.length) {
    await db.query("CALL upsert_products_bulk(?, ?)", [
      JSON.stringify(parsed.products),
      parsed.sale_date,
    ]);
    console.log(`   OK: ${parsed.products.length} products`);
  }

  // ---- insertSalesChunk ----
  const saleRows = parsed.sales.map((r) => ({
    ...r,
    sale_date: parsed.sale_date,
    batch_id: batchId,
  }));

  let inserted = 0;
  for (let i = 0; i < saleRows.length; i += chunkSize) {
    const chunk = saleRows.slice(i, i + chunkSize);
    const rowPH = `(${STAGING_COLS.map(() => "?").join(", ")})`;
    const allPH = chunk.map(() => rowPH).join(", ");
    const values = chunk.flatMap((r) => toStagingRow(r, batchId, parsed.sale_date));
    await db.query(
      `INSERT INTO staging_sales (${STAGING_COLS.join(", ")}) VALUES ${allPH}`,
      values,
    );
    inserted += chunk.length;
    const pct = Math.round((inserted / totalRows) * 100);
    console.log(`   OK: chunk ${i / chunkSize + 1}: ${chunk.length} rows (${pct}%)`);
  }

  // ---- finalizeImport ----
  console.log("\nFinalizing...");
  await db.query("CALL finalize_import(?, ?, ?, ?)", [
    batchId,
    parsed.sale_date,
    totalRows,
    userId ?? null,
  ]);
  console.log("   OK: import finalized");

  console.log(`\nImport completed successfully.`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal error:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
