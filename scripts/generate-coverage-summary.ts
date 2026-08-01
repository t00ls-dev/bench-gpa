#!/usr/bin/env bun
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { COVERAGE_THRESHOLDS as THRESHOLDS } from "./coverage-thresholds";

type Metric = { total: number; covered: number; skipped: number; pct: number };
type FileSummary = {
  lines: Metric;
  statements: Metric;
  functions: Metric;
  branches: Metric;
};
type CoverageSummary = Record<string, FileSummary> & { total: FileSummary };

const root = resolve(import.meta.dir, "..");
const summaryPath = join(root, "coverage/coverage-summary.json");

if (!existsSync(summaryPath)) {
  console.error("coverage/coverage-summary.json not found: run `bun run coverage` first");
  process.exit(1);
}

const summary: CoverageSummary = JSON.parse(readFileSync(summaryPath, "utf-8"));
const { total, ...files } = summary;

function pctBadge(pct: number, threshold: number): string {
  return pct >= threshold ? "ok" : "abaixo do threshold";
}

function row(label: string, m: FileSummary): string {
  return [
    `| ${label} `,
    `| ${m.lines.pct.toFixed(1)}% ${pctBadge(m.lines.pct, THRESHOLDS.lines)} `,
    `| ${m.statements.pct.toFixed(1)}% ${pctBadge(m.statements.pct, THRESHOLDS.statements)} `,
    `| ${m.functions.pct.toFixed(1)}% ${pctBadge(m.functions.pct, THRESHOLDS.functions)} `,
    `| ${m.branches.pct.toFixed(1)}% ${pctBadge(m.branches.pct, THRESHOLDS.branches)} |`,
  ].join("");
}

const fileRows = Object.entries(files)
  .map(([path, m]) => ({ path: relative(root, path), m }))
  .sort((a, b) => a.m.lines.pct - b.m.lines.pct)
  .map(({ path, m }) => row(`\`${path}\``, m));

const lines = [
  "# Cobertura de testes",
  "",
  `_Gerado em ${new Date().toISOString()}, thresholds: lines ${THRESHOLDS.lines}%, statements ${THRESHOLDS.statements}%, functions ${THRESHOLDS.functions}%, branches ${THRESHOLDS.branches}%_`,
  "",
  "## Total",
  "",
  "| | Lines | Statements | Functions | Branches |",
  "|---|---|---|---|---|",
  row("**Total**", total),
  "",
  "## Por arquivo (ordenado por cobertura de linhas, pior primeiro)",
  "",
  "| Arquivo | Lines | Statements | Functions | Branches |",
  "|---|---|---|---|---|",
  ...fileRows,
  "",
];

const outPath = join(root, "docs/coverage-summary.md");
writeFileSync(outPath, lines.join("\n"));
console.error(
  `docs/coverage-summary.md generated (${fileRows.length} files, total lines: ${total.lines.pct.toFixed(1)}%)`,
);
