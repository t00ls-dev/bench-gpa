#!/usr/bin/env bun
/**
 * CLI import de planilha XLSX (formato GPA)
 *
 * Uso:
 *   bun run scripts/import.ts caminho/para/arquivo.xlsx [--user-id UUID]
 *
 * Opções:
 *   --user-id UUID   ID do usuário que está importando (opcional)
 *   --chunk-size N   Linhas por lote (padrão 1000)
 *   --help           Exibe ajuda
 *
 * Requer variáveis de ambiente:
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { parseAnyWorkbook } from "../src/lib/xlsx-parser";

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

async function main() {
  const { filePath, userId, chunkSize } = parseArgs();

  console.log(`📄 Lendo ${filePath}...`);
  const buffer = readFileSync(filePath).buffer;
  const parsed = parseAnyWorkbook(buffer);
  console.log(`   Data: ${parsed.sale_date}`);
  console.log(`   Vendas: ${parsed.sales.length}`);
  console.log(`   Lojas: ${parsed.stores.length}`);
  console.log(`   Produtos: ${parsed.products.length}`);

  const { supabaseAdmin } = await import("../src/integrations/supabase/client.server");
  const batchId = randomUUID();
  const totalRows = parsed.sales.length;

  // ---- beginImport ----
  console.log(`\n🚀 Iniciando importação (batch ${batchId})...`);
  const { error: cleanErr } = await supabaseAdmin.from("staging_sales").delete().eq("sale_date", parsed.sale_date);
  if (cleanErr) { console.error("   ❌ Erro ao limpar staging:", cleanErr.message); process.exit(1); }
  console.log("   ✓ Staging limpo");

  if (parsed.stores.length) {
    const { error } = await supabaseAdmin.from("stores").upsert(parsed.stores, { onConflict: "store_code" });
    if (error) { console.error("   ❌ Erro ao upsert lojas:", error.message); process.exit(1); }
    console.log(`   ✓ ${parsed.stores.length} lojas`);
  }

  if (parsed.products.length) {
    const { error: upErr } = await supabaseAdmin.rpc("upsert_products_bulk", {
      p_rows: parsed.products,
      p_sale_date: parsed.sale_date,
    });
    if (upErr) { console.error("   ❌ Erro ao upsert produtos:", upErr.message); process.exit(1); }
    console.log(`   ✓ ${parsed.products.length} produtos`);
  }

  // ---- insertSalesChunk ----
  const saleRows = parsed.sales.map((r) => ({ ...r, batch_id: batchId, sale_date: parsed.sale_date }));
  let inserted = 0;
  for (let i = 0; i < saleRows.length; i += chunkSize) {
    const chunk = saleRows.slice(i, i + chunkSize);
    const { error } = await supabaseAdmin.from("staging_sales").insert(chunk);
    if (error) { console.error(`   ❌ Erro no chunk ${i / chunkSize + 1}:`, error.message); process.exit(1); }
    inserted += chunk.length;
    const pct = Math.round((inserted / totalRows) * 100);
    console.log(`   ✓ Chunk ${i / chunkSize + 1}: ${chunk.length} linhas (${pct}%)`);
  }

  // ---- finalizeImport ----
  console.log("\n🔄 Finalizando...");
  const { error: swapErr } = await supabaseAdmin.rpc("finalize_import", {
    p_batch_id: batchId,
    p_sale_date: parsed.sale_date,
    p_row_count: totalRows,
    p_imported_by: (userId ?? null) as unknown as string,
  });
  if (swapErr) { console.error("   ❌ Erro ao finalizar:", swapErr.message); process.exit(1); }
  console.log("   ✓ Importação finalizada");

  // ---- purgeOldAggs ----
  console.log("\n🧹 Purga agregados antigos...");
  const { error: purgeErr } = await supabaseAdmin.rpc("purge_old_aggs", { p_days: 28 });
  if (purgeErr) console.warn("   ⚠️  Erro na purga (não fatal):", purgeErr.message);
  else console.log("   ✓ Purga concluída");

  console.log(`\n✅ Importação concluída com sucesso!`);
}

main().catch((err) => {
  console.error("❌ Erro fatal:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
