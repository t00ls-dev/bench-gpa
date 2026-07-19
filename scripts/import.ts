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
  const { error: cleanErr } = await supabaseAdmin
    .from("staging_sales")
    .delete()
    .eq("sale_date", parsed.sale_date);
  if (cleanErr) {
    console.error("   ❌ Erro ao limpar staging:", cleanErr.message);
    process.exit(1);
  }
  console.log("   ✓ Staging limpo");

  if (parsed.stores.length) {
    const { error } = await supabaseAdmin
      .from("stores")
      .upsert(parsed.stores, { onConflict: "store_code" });
    if (error) {
      console.error("   ❌ Erro ao upsert lojas:", error.message);
      process.exit(1);
    }
    console.log(`   ✓ ${parsed.stores.length} lojas`);
  }

  if (parsed.products.length) {
    const { error: upErr } = await supabaseAdmin.rpc("upsert_products_bulk", {
      p_rows: parsed.products,
      p_sale_date: parsed.sale_date,
    });
    if (upErr) {
      console.error("   ❌ Erro ao upsert produtos:", upErr.message);
      process.exit(1);
    }
    console.log(`   ✓ ${parsed.products.length} produtos`);
  }

  // ---- insertSalesChunk ----
  const saleRows = parsed.sales.map((r) => ({
    ...r,
    batch_id: batchId,
    sale_date: parsed.sale_date,
  }));
  let inserted = 0;
  for (let i = 0; i < saleRows.length; i += chunkSize) {
    const chunk = saleRows.slice(i, i + chunkSize);
    const { error } = await supabaseAdmin.from("staging_sales").insert(chunk);
    if (error) {
      console.error(`   ❌ Erro no chunk ${i / chunkSize + 1}:`, error.message);
      process.exit(1);
    }
    inserted += chunk.length;
    const pct = Math.round((inserted / totalRows) * 100);
    console.log(`   ✓ Chunk ${i / chunkSize + 1}: ${chunk.length} linhas (${pct}%)`);
  }

  // ---- finalizeImport (manual, evita timeout do RPC) ----
  console.log("\n🔄 Finalizando...");

  const PAGE_SIZE = 2000;
  const allStaging: Record<string, unknown>[] = [];
  let offset = 0;
  for (;;) {
    const { data: rows, error: fetchErr } = await supabaseAdmin
      .from("staging_sales")
      .select("*")
      .eq("batch_id", batchId)
      .order("prod_code", { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);
    if (fetchErr) {
      console.error("   ❌ Erro ao buscar staging:", fetchErr.message);
      process.exit(1);
    }
    if (!rows || rows.length === 0) break;
    allStaging.push(...rows);
    offset += rows.length;
  }
  console.log(`   ✓ ${allStaging.length} linhas lidas do staging`);

  // 3. Deleta agregações antigas da data
  const { error: del1 } = await supabaseAdmin
    .from("sales_daily_agg")
    .delete()
    .eq("sale_date", parsed.sale_date);
  if (del1) {
    console.error("   ❌ Erro ao deletar sales_daily_agg:", del1.message);
    process.exit(1);
  }
  const { error: del2 } = await supabaseAdmin
    .from("sales_prod_daily_agg")
    .delete()
    .eq("sale_date", parsed.sale_date);
  if (del2) {
    console.error("   ❌ Erro ao deletar sales_prod_daily_agg:", del2.message);
    process.exit(1);
  }

  // 4. Agrupa no cliente para sales_daily_agg
  const dKey = (r: Record<string, unknown>) =>
    `${r.sale_date}|${r.store_code}|${r.depto}|${r.secao}|${r.grupo}|${r.subgrupo}`;
  const dailyMap = new Map<string, Record<string, unknown>>();
  for (const r of allStaging) {
    const k = dKey(r);
    const existing = dailyMap.get(k);
    if (existing) {
      existing.val_vda += r.val_vda;
      existing.item_count++;
    } else {
      dailyMap.set(k, {
        sale_date: r.sale_date,
        store_code: r.store_code,
        store_name: r.store_name,
        depto: r.depto,
        secao: r.secao,
        grupo: r.grupo,
        subgrupo: r.subgrupo,
        val_vda: r.val_vda,
        item_count: 1,
      });
    }
  }
  const dailyAggs = Array.from(dailyMap.values());

  const pKey = (r: Record<string, unknown>) =>
    `${r.sale_date}|${r.store_code}|${r.depto}|${r.secao}|${r.grupo}|${r.subgrupo}|${r.prod_code}`;
  const prodMap = new Map<string, Record<string, unknown>>();
  for (const r of allStaging) {
    const k = pKey(r);
    const existing = prodMap.get(k);
    if (existing) {
      existing.val_vda += r.val_vda;
      existing.item_count++;
    } else {
      prodMap.set(k, {
        sale_date: r.sale_date,
        store_code: r.store_code,
        store_name: r.store_name,
        depto: r.depto,
        secao: r.secao,
        grupo: r.grupo,
        subgrupo: r.subgrupo,
        prod_code: r.prod_code,
        prod_name: r.prod_name,
        val_vda: r.val_vda,
        item_count: 1,
      });
    }
  }
  const prodAggs = Array.from(prodMap.values());

  // 5. Insere agregações em lote
  for (let i = 0; i < dailyAggs.length; i += 1000) {
    const { error: insErr } = await supabaseAdmin
      .from("sales_daily_agg")
      .insert(dailyAggs.slice(i, i + 1000));
    if (insErr) {
      console.error("   ❌ Erro ao inserir sales_daily_agg:", insErr.message);
      process.exit(1);
    }
  }
  console.log(`   ✓ ${dailyAggs.length} linhas em sales_daily_agg`);
  for (let i = 0; i < prodAggs.length; i += 1000) {
    const { error: insErr } = await supabaseAdmin
      .from("sales_prod_daily_agg")
      .insert(prodAggs.slice(i, i + 1000));
    if (insErr) {
      console.error("   ❌ Erro ao inserir sales_prod_daily_agg:", insErr.message);
      process.exit(1);
    }
  }
  console.log(`   ✓ ${prodAggs.length} linhas em sales_prod_daily_agg`);

  // 6. Limpa staging
  const { error: cleanStgErr } = await supabaseAdmin
    .from("staging_sales")
    .delete()
    .eq("batch_id", batchId);
  if (cleanStgErr) {
    console.error("   ❌ Erro ao limpar staging:", cleanStgErr.message);
    process.exit(1);
  }

  // 7. Registra no log
  const { error: logErr } = await supabaseAdmin.from("import_log").upsert(
    {
      sale_date: parsed.sale_date,
      row_count: totalRows,
      imported_at: new Date().toISOString(),
      imported_by: userId ?? null,
    },
    { onConflict: "sale_date" },
  );
  if (logErr) {
    console.error("   ❌ Erro ao registrar log:", logErr.message);
    process.exit(1);
  }

  // 8. Atualiza hierarquia
  const { error: hierErr } = await supabaseAdmin.rpc("refresh_filter_hierarchy");
  if (hierErr) console.warn("   ⚠️  Erro ao atualizar hierarquia (não fatal):", hierErr.message);

  console.log("   ✓ Importação finalizada");

  // ---- purgeOldAggs ----
  console.log("\n🧹 Verificando retenção (4 ocorrências por dia da semana)...");

  const { data: logEntries, error: datesErr } = await supabaseAdmin
    .from("import_log")
    .select("sale_date")
    .order("sale_date");

  if (datesErr) {
    console.error("   ❌ Erro ao buscar import_log:", datesErr.message);
    process.exit(1);
  }

  const dates = (logEntries ?? []).map((r) => r.sale_date);
  if (dates.length < 28) {
    console.log(`   ✓ Apenas ${dates.length} datas, mínimo 28 necessário. Nada a purgar.`);
  } else {
    const byDOW: Record<number, string[]> = {};
    for (const d of dates) {
      const dow = new Date(d + "T12:00:00").getDay();
      if (!byDOW[dow]) byDOW[dow] = [];
      byDOW[dow].push(d);
    }

    const toDelete: string[] = [];
    for (const dowStr of Object.keys(byDOW)) {
      const sorted = byDOW[Number(dowStr)].sort().reverse();
      for (let i = 4; i < sorted.length; i++) {
        toDelete.push(sorted[i]);
      }
    }

    if (toDelete.length > 0) {
      for (const table of ["sales_prod_daily_agg", "sales_daily_agg", "import_log"] as const) {
        for (let i = 0; i < toDelete.length; i += 50) {
          const { error } = await supabaseAdmin
            .from(table)
            .delete()
            .in("sale_date", toDelete.slice(i, i + 50));
          if (error) console.warn(`   ⚠️  Erro ao limpar ${table}:`, error.message);
        }
      }
      console.log(`   ✓ ${toDelete.length} datas excedentes removidas`);
    } else {
      console.log("   ✓ Nenhuma data excedente, nada a purgar.");
    }
  }

  console.log(`\n✅ Importação concluída com sucesso!`);
}

main().catch((err) => {
  console.error("❌ Erro fatal:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
