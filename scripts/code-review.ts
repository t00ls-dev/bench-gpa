#!/usr/bin/env bun
import { readdirSync, readFileSync, writeFileSync, existsSync, mkdirSync, appendFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const LOG_FILE = "logs/review.log";
const DOCS_DIR = "docs";
const IMPROV_DIR = join(DOCS_DIR, "improvements");

function log(msg: string) {
  const ts = new Date().toISOString().replace("T", " ").slice(0, 19);
  const line = `[${ts}] ${msg}`;
  console.log(line);
  const dir = LOG_FILE.split("/")[0];
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  appendFileSync(LOG_FILE, line + "\n");
}

function exec(cmd: string[], opts?: { cwd?: string; timeout?: number }): { ok: boolean; stdout: string; stderr: string } {
  const result = Bun.spawnSync(cmd, {
    cwd: opts?.cwd,
    timeout: opts?.timeout ?? 300_000,
  });
  return {
    ok: result.exitCode === 0,
    stdout: result.stdout.toString().trim(),
    stderr: result.stderr.toString().trim(),
  };
}

interface LintIssue {
  file: string;
  line: number;
  col: number;
  severity: "error" | "warning";
  message: string;
}

function parseLintOutput(stdout: string): LintIssue[] {
  const issues: LintIssue[] = [];
  const regex = /^(.+?):(\d+):(\d+):\s+(error|warning)\s+(.+)$/gm;
  let m;
  while ((m = regex.exec(stdout)) !== null) {
    issues.push({ file: m[1], line: Number(m[2]), col: Number(m[3]), severity: m[4] as "error" | "warning", message: m[5] });
  }
  return issues;
}

interface FileStats {
  path: string;
  lines: number;
}

function walkDir(dir: string, base: string): FileStats[] {
  const result: FileStats[] = [];
  try {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory() && entry.name !== "node_modules" && entry.name !== ".output" && entry.name !== ".git" && entry.name !== ".nitro" && entry.name !== ".wrangler" && !entry.name.startsWith(".")) {
        result.push(...walkDir(full, base));
      } else if (entry.isFile() && (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx"))) {
        try {
          const content = readFileSync(full, "utf-8");
          result.push({ path: full.replace(base + "/", ""), lines: content.split("\n").length });
        } catch {}
      }
    }
  } catch {}
  return result;
}

function findTodos(base: string): { file: string; line: number; text: string }[] {
  const todos: { file: string; line: number; text: string }[] = [];
  const files = walkDir(base, base).filter((f) => f.path.startsWith("src/"));
  for (const f of files) {
    try {
      const content = readFileSync(join(base, f.path), "utf-8");
      const lines = content.split("\n");
      for (let i = 0; i < lines.length; i++) {
        const idx = lines[i].search(/\/\/\s*(TODO|FIXME|HACK|XXX)/i);
        if (idx !== -1) {
          todos.push({ file: f.path, line: i + 1, text: lines[i].slice(idx).trim() });
        }
      }
    } catch {}
  }
  return todos;
}

function nextDocNumber(): string {
  if (!existsSync(IMPROV_DIR)) return "01";
  const files = readdirSync(IMPROV_DIR).filter((f) => /^\d{2}-.+\.md$/.test(f)).sort();
  if (files.length === 0) return "01";
  const last = files[files.length - 1];
  const num = parseInt(last.slice(0, 2), 10) + 1;
  return String(num).padStart(2, "0");
}

function existingDocSlugs(): string[] {
  if (!existsSync(IMPROV_DIR)) return [];
  return readdirSync(IMPROV_DIR).filter((f) => f.endsWith(".md") && f !== "README.md").sort();
}

const NOW = new Date();
const DATE_BR = NOW.toLocaleDateString("pt-BR");
const TIME_BR = NOW.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
const DATE_ISO = NOW.toISOString().split("T")[0];

async function main() {
  log("====== code-review start ======");

  // 1. git pull
  log("Pull: starting...");
  const pull = exec(["git", "pull", "--rebase", "--autostash"]);
  if (!pull.ok) {
    log(`Pull: ERROR — ${pull.stderr}`);
    log("====== code-review abort ======");
    process.exit(1);
  }
  log(`Pull: ${pull.stdout || "Already up to date."}`);

  const projectRoot = process.cwd();

  // 2. Run lint
  log("Lint: starting...");
  const lint = exec(["bun", "run", "lint"], { timeout: 120_000 });
  const lintIssues = lint.ok ? [] : parseLintOutput(lint.stdout || lint.stderr);
  const lintErrors = lintIssues.filter((i) => i.severity === "error");
  const lintWarnings = lintIssues.filter((i) => i.severity === "warning");
  log(`Lint: ${lintErrors.length} errors, ${lintWarnings.length} warnings`);

  // 3. Check build
  log("Build check: starting...");
  const buildCheck = exec(["bun", "run", "build"], { timeout: 300_000 });
  const buildOk = buildCheck.ok;
  log(`Build: ${buildOk ? "OK" : "FAILED — " + buildCheck.stderr.slice(0, 200)}`);

  // 4. Source file analysis
  log("Source analysis: scanning...");
  const allFiles = walkDir(join(projectRoot, "src"), projectRoot);
  const largeFiles = allFiles.filter((f) => f.lines > 300).sort((a, b) => b.lines - a.lines);
  const totalLines = allFiles.reduce((s, f) => s + f.lines, 0);
  log(`Source: ${allFiles.length} files, ${totalLines} lines, ${largeFiles.length} large files (>300)`);

  // 5. TODO/FIXME scan
  log("TODO scan: searching...");
  const todos = findTodos(projectRoot);
  log(`TODO: ${todos.length} items found`);

  // 6. Existing doc review
  log("Doc review: checking existing...");
  const existingDocs = existingDocSlugs().map((f) => {
    const content = readFileSync(join(IMPROV_DIR, f), "utf-8");
    const titleMatch = content.match(/^#\s+(.+)/m);
    const dateMatch = content.match(/(\w{3}\/\d{4})/);
    return { file: f, title: titleMatch?.[1] ?? f, date: dateMatch?.[1] ?? "?" };
  });
  log(`Doc review: ${existingDocs.length} existing docs`);

  // 7. Check db health
  log("DB health: skipped (server function — not available in CLI)");

  // 8. Generate snapshot doc
  const num = nextDocNumber();
  const slug = `${num}-revisao-${DATE_ISO}`;
  const fileName = `${slug}.md`;
  const filePath = join(IMPROV_DIR, fileName);

  const snapshotContent = [
    `# Revisão Automática — ${DATE_BR} ${TIME_BR}`,
    "",
    `Snapshot automatizado do estado do código em ${DATE_BR} às ${TIME_BR}.`,
    "",
    "---",
    "",
    "## Métricas Gerais",
    "",
    `| Métrica | Valor |`,
    `|---|---|`,
    `| Arquivos .ts/.tsx | ${allFiles.length} |`,
    `| Linhas de código | ${totalLines.toLocaleString("pt-BR")} |`,
    `| Arquivos grandes (>300 linhas) | ${largeFiles.length} |`,
    `| Erros de lint | ${lintErrors.length} |`,
    `| Avisos de lint | ${lintWarnings.length} |`,
    `| Build | ${buildOk ? "✅ OK" : "❌ Falhou"} |`,
    `| TODOs/FIXMEs | ${todos.length} |`,
    "",
    "---",
    "",
    "## Lint",
    "",
    ...(lintIssues.length === 0
      ? ["Nenhum problema encontrado."]
      : ["### Erros", "", ...lintErrors.map((i) => `- \`${i.file}:${i.line}:${i.col}\` — ${i.message}`), "", "### Avisos", "", ...lintWarnings.map((i) => `- \`${i.file}:${i.line}:${i.col}\` — ${i.message}`)]
    ),
    "",
    "---",
    "",
    "## Arquivos Grandes (>300 linhas)",
    "",
    ...(largeFiles.length === 0
      ? ["Nenhum arquivo grande encontrado."]
      : largeFiles.map((f) => `- \`${f.path}\` — ${f.lines} linhas`)
    ),
    "",
    "---",
    "",
    "## TODOs e FIXMEs",
    "",
    ...(todos.length === 0
      ? ["Nenhum TODO/FIXME encontrado."]
      : todos.map((t) => `- \`${t.file}:${t.line}\` — ${t.text}`)
    ),
    "",
    "---",
    "",
    "## Documentos Existentes",
    "",
    ...(existingDocs.length === 0
      ? ["Nenhum documento de análise existente."]
      : existingDocs.map((d) => `- \`${d.file}\` — ${d.title} (${d.date})`)
    ),
    "",
    "---",
    "",
    "## Observações",
    "",
    `Revisão gerada automaticamente em ${DATE_BR}.`,
    ...(lintErrors.length > 0 ? ["- 🔴 Existem erros de lint que precisam de correção."] : []),
    ...(lintWarnings.length > 0 ? [`- 🟡 ${lintWarnings.length} avisos de lint — revisar se aplicável.`] : []),
    ...(!buildOk ? ["- 🔴 Build falhou — verificar erros de compilação."] : []),
    ...(largeFiles.length > 0 ? [`- 🟡 ${largeFiles.length} arquivos com mais de 300 linhas — considerar refatoração.`] : []),
    ...(todos.length > 0 ? [`- 🟡 ${todos.length} TODOs/FIXMEs pendentes.`] : []),
    "",
  ].join("\n");

  if (!existsSync(IMPROV_DIR)) mkdirSync(IMPROV_DIR, { recursive: true });
  writeFileSync(filePath, snapshotContent);
  log(`Doc: created ${fileName}`);

  // 9. Git add + commit + push
  log("Git: add...");
  const add = exec(["git", "add", DOCS_DIR]);
  if (!add.ok) {
    log(`Git add: ERROR — ${add.stderr}`);
  } else {
    const ts = NOW.toISOString().replace("T", " ").slice(0, 16);
    const commit = exec(["git", "commit", "-m", `code-review: ${ts} — ${lintErrors.length} errors, ${lintWarnings.length} warnings, ${totalLines} lines`]);
    if (!commit.ok) {
      if (commit.stderr.includes("nothing to commit")) {
        log("Git: nothing to commit");
      } else {
        log(`Git commit: ERROR — ${commit.stderr}`);
      }
    } else {
      log(`Git: ${commit.stdout}`);
      const push = exec(["git", "push"]);
      log(`Git push: ${push.ok ? (push.stdout || "OK") : "ERROR — " + push.stderr}`);
    }
  }

  log("====== code-review end ======");
}

main().catch((err) => {
  log(`FATAL: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
