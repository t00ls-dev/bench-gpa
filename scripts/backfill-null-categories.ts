#!/usr/bin/env bun
/**
 * Backfill: converte categorias gravadas como a string "0" de volta para NULL.
 *
 * Contexto: o import via CLI (scripts/import.ts) gravava `0` para
 * depto/secao/grupo/subgrupo nulos (bug do `?? 0`, corrigido em staging-row.ts).
 * O MariaDB coagia esse 0 para a string "0" no VARCHAR, poluindo a
 * filter_hierarchy e os rankings com uma categoria fantasma "0".
 *
 * Este script é idempotente: rodar de novo com tudo limpo não faz nada.
 * Um nome real de depto/secao/grupo/subgrupo nunca é literalmente "0"
 * (são textos como "MERCEARIA"), então NULLIF(col, '0') é seguro.
 *
 * Uso:
 *   bun run scripts/backfill-null-categories.ts --dry-run   # só diagnostica
 *   bun run scripts/backfill-null-categories.ts             # aplica
 */
import db from "../src/lib/db";

const COLS = ["depto", "secao", "grupo", "subgrupo"] as const;

async function countAggZeros(): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const c of COLS) {
    const [rows] = await db.query(
      `SELECT COUNT(*) AS n FROM sales_prod_daily_agg WHERE ${c} = '0'`,
    );
    out[c] = Number((rows as { n: number }[])[0]?.n ?? 0);
  }
  return out;
}

async function countHierZeros(): Promise<number> {
  const [rows] = await db.query(
    `SELECT COUNT(*) AS n FROM filter_hierarchy
      WHERE depto = '0' OR secao = '0' OR grupo = '0' OR subgrupo = '0'`,
  );
  return Number((rows as { n: number }[])[0]?.n ?? 0);
}

function total(rec: Record<string, number>): number {
  return Object.values(rec).reduce((a, b) => a + b, 0);
}

async function main() {
  const dry = process.argv.includes("--dry-run");
  console.log(`\n== Backfill categorias "0" → NULL${dry ? "  (DRY RUN)" : ""} ==\n`);

  const beforeAgg = await countAggZeros();
  const beforeHier = await countHierZeros();
  console.log("sales_prod_daily_agg (linhas com '0' por coluna):");
  console.table(beforeAgg);
  console.log(`filter_hierarchy (linhas com algum '0'): ${beforeHier}`);

  if (total(beforeAgg) === 0 && beforeHier === 0) {
    console.log('\nNada a fazer: nenhuma categoria "0" encontrada.');
    process.exit(0);
  }

  if (dry) {
    console.log(
      `\nDRY RUN: ${total(beforeAgg)} valores em sales_prod_daily_agg seriam convertidos ` +
        `para NULL e a filter_hierarchy seria regenerada. Nada foi alterado.`,
    );
    process.exit(0);
  }

  // O UPDATE é um único statement atômico por si só. A filter_hierarchy é
  // derivada, então é regenerada do zero pelo proc (não editada diretamente):
  // isso também remove eventuais linhas que fiquem totalmente nulas.
  if (total(beforeAgg) > 0) {
    const [res] = await db.query(
      `UPDATE sales_prod_daily_agg
          SET depto    = NULLIF(depto, '0'),
              secao    = NULLIF(secao, '0'),
              grupo    = NULLIF(grupo, '0'),
              subgrupo = NULLIF(subgrupo, '0')
        WHERE depto = '0' OR secao = '0' OR grupo = '0' OR subgrupo = '0'`,
    );
    console.log(
      `\nsales_prod_daily_agg: ${(res as { affectedRows: number }).affectedRows} linhas atualizadas.`,
    );
  }

  await db.query("CALL refresh_filter_hierarchy()");
  console.log("filter_hierarchy regenerada via refresh_filter_hierarchy().");

  const afterAgg = await countAggZeros();
  const afterHier = await countHierZeros();
  const remaining = total(afterAgg) + afterHier;
  console.log("\nApós o backfill:");
  console.table(afterAgg);
  console.log(`filter_hierarchy com '0': ${afterHier}`);
  console.log(
    remaining === 0 ? "\nBackfill concluído." : `\nAinda restam ${remaining} valores "0".`,
  );
  process.exit(remaining === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("Erro:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
