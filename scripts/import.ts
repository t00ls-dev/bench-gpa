#!/usr/bin/env bun
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { parseAnyWorkbook } from "../src/lib/xlsx-parser";
import { STAGING_COLS, toStagingRow } from "../src/lib/staging-row";
import db from "../src/lib/db";
import { IMPORT_CHUNK_SIZE } from "../src/lib/import-config";
import { parseImportChunkSize, parseImportReplace } from "../src/lib/import-cli";
import { mapImportError } from "../src/lib/import-errors";

function parseArgs() {
  const args = process.argv.slice(2);
  if (args.length === 0 || args.includes("--help")) {
    console.log(`
Usage: bun run scripts/import.ts <file.xlsx> [options]

Options:
  --user-id UUID     ID of the user performing the import
  --chunk-size N     Rows per batch, 1-${IMPORT_CHUNK_SIZE} (default ${IMPORT_CHUNK_SIZE})
  --replace          Replace the date if it has already been imported
  --help             Show this message
`);
    process.exit(0);
  }

  const filePath = args.find((a) => !a.startsWith("--"))!;
  const userId = extractArg(args, "--user-id");
  const chunkSize = parseImportChunkSize(args);
  const replaceExisting = parseImportReplace(args);

  return { filePath, userId, chunkSize, replaceExisting };
}

function extractArg(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag);
  if (idx === -1 || idx + 1 >= args.length) return undefined;
  return args[idx + 1];
}

async function main() {
  const { filePath, userId, chunkSize, replaceExisting } = parseArgs();

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
  // should fail before acquiring the global import lock.
  if (totalRows === 0) {
    throw new Error("No sale rows to import.");
  }

  let lockAcquired = false;
  try {
    // ---- beginImport ----
    console.log(`\nStarting import (batch ${batchId})...`);
    await db.query("CALL acquire_import_lock_checked(?, ?, ?, ?, ?, ?)", [
      batchId,
      parsed.sale_date,
      userId ?? null,
      JSON.stringify(parsed.stores),
      JSON.stringify(parsed.products),
      replaceExisting,
    ]);
    lockAcquired = true;
    console.log("   OK: exclusive import lock acquired");

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
      const connection = await db.getConnection();
      try {
        await connection.beginTransaction();
        await connection.query("CALL renew_import_lock(?, ?, ?)", [
          batchId,
          parsed.sale_date,
          userId ?? null,
        ]);
        await connection.query(
          `INSERT INTO staging_sales (${STAGING_COLS.join(", ")}) VALUES ${allPH}`,
          values,
        );
        await connection.commit();
      } catch (error) {
        await connection.rollback();
        throw error;
      } finally {
        connection.release();
      }
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
    lockAcquired = false;
    console.log("   OK: import finalized");

    console.log(`\nImport completed successfully.`);
  } finally {
    if (lockAcquired) {
      try {
        await db.query("CALL release_import_lock(?, ?)", [batchId, userId ?? null]);
      } catch (releaseError) {
        console.error(
          "Failed to release import lock:",
          releaseError instanceof Error ? releaseError.message : releaseError,
        );
      }
    }
  }
  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal error:", mapImportError(err).message);
  process.exit(1);
});
