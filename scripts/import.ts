#!/usr/bin/env bun
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { parseAnyWorkbook } from "../src/lib/xlsx-parser";
import db from "../src/lib/db";

function parseArgs() {
  const args = process.argv.slice(2);
  if (args.length === 0 || args.includes("--help")) {
    console.log(`
Uso: bun run scripts/import.ts <arquivo.xlsx> [opções]

Opções:
  --user-id UUID     ID do usuário que está importando
  --chunk-size N     Linhas por lote (padrão 1000)
  --help             Exibe esta mensagem
`);
    process.exit(0);
  }

  const filePath = args.find((a) => !a.startsWith("--"))!;
  const userId = extractArg(args, "--user-id");
  const chunkSize = parseInt(extractArg(args, "--chunk-size") ?? "1000", 10);

  return { filePath, userId, chunkSize };
}

function extractArg(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag);
  if (idx === -1 || idx + 1 >= args.length) return undefined;
  return args[idx + 1];
}

const STAGING_COLS = [
  "sale_date", "batch_id", "store_code", "store_name",
  "prod_code", "prod_name", "depto", "secao", "grupo", "subgrupo",
  "val_vda", "qty_vda", "val_cus", "qty_cus",
  "val_dev", "qty_dev", "val_vda_liq", "qty_vda_liq",
  "val_cus_liq", "qty_cus_liq", "val_sld", "qty_sld", "per_mrg",
];

function toStagingRow(r: Record<string, unknown>, batchId: string, saleDate: string) {
  return STAGING_COLS.map((c) => {
    if (c === "sale_date") return saleDate;
    if (c === "batch_id") return batchId;
    return (r as any)[c] ?? 0;
  });
}

async function main() {
  const { filePath, userId, chunkSize } = parseArgs();

  console.log(`📄 Lendo ${filePath}...`);
  const buffer = readFileSync(filePath).buffer;
  const parsed = parseAnyWorkbook(buffer);
  console.log(`   Data: ${parsed.sale_date}`);
  console.log(`   Vendas: ${parsed.sales.length}`);
  console.log(`   Lojas: ${parsed.stores.length}`);
  console.log(`   Produtos: ${parsed.products.length}`);

  const batchId = randomUUID();
  const totalRows = parsed.sales.length;

  // ---- beginImport ----
  console.log(`\n🚀 Iniciando importação (batch ${batchId})...`);
  await db.query("DELETE FROM staging_sales WHERE sale_date = ?", [parsed.sale_date]);
  console.log("   ✓ Staging limpo");

  if (parsed.stores.length) {
    const ph = parsed.stores.map(() => "(?, ?)").join(", ");
    const vals = parsed.stores.flatMap((s) => [s.store_code, s.store_name]);
    await db.query(
      `INSERT INTO stores (store_code, store_name) VALUES ${ph} ON DUPLICATE KEY UPDATE store_name = VALUES(store_name)`,
      vals,
    );
    console.log(`   ✓ ${parsed.stores.length} lojas`);
  }

  if (parsed.products.length) {
    await db.query("CALL upsert_products_bulk(?, ?)", [
      JSON.stringify(parsed.products),
      parsed.sale_date,
    ]);
    console.log(`   ✓ ${parsed.products.length} produtos`);
  }

  // ---- insertSalesChunk ----
  const saleRows = parsed.sales.map((r: Record<string, unknown>) => ({
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
    console.log(`   ✓ Chunk ${i / chunkSize + 1}: ${chunk.length} linhas (${pct}%)`);
  }

  // ---- finalizeImport ----
  console.log("\n🔄 Finalizando...");
  await db.query("CALL finalize_import(?, ?, ?, ?)", [
    batchId,
    parsed.sale_date,
    totalRows,
    userId ?? null,
  ]);
  console.log("   ✓ Importação finalizada");

  console.log(`\n✅ Importação concluída com sucesso!`);
  process.exit(0);
}

main().catch((err) => {
  console.error("❌ Erro fatal:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
