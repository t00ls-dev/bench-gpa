#!/usr/bin/env bun
import { readdirSync, renameSync, existsSync, mkdirSync, appendFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { extractDate } from "./extract-date";

const LOG_FILE = "logs/import.log";

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
    timeout: opts?.timeout ?? 600_000,
  });
  return {
    ok: result.exitCode === 0,
    stdout: result.stdout.toString().trim(),
    stderr: result.stderr.toString().trim(),
  };
}

function isTracked(path: string): boolean {
  return exec(["git", "ls-files", "--error-unmatch", path]).ok;
}

function gitMv(src: string, dst: string): boolean {
  return exec(["git", "mv", src, dst]).ok;
}

function gitRm(path: string): boolean {
  return exec(["git", "rm", "--cached", path]).ok;
}

async function main() {
  log("====== import-watch start ======");

  // 1. git pull
  log("Pull: starting...");
  const pull = exec(["git", "pull", "--rebase", "--autostash"]);
  if (!pull.ok) {
    log(`Pull: ERROR — ${pull.stderr}`);
    log("====== import-watch abort ======");
    process.exit(1);
  }
  log(`Pull: ${pull.stdout || "Already up to date."}`);

  // 2. Current month directory
  const now = new Date();
  const monthDir = `data/${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  if (!existsSync(monthDir)) {
    log(`Scan: ${monthDir}/ — not found, creating`);
    mkdirSync(monthDir, { recursive: true });
  } else {
    log(`Scan: ${monthDir}/`);
  }

  // 3. List non-normalized .xlsx files (not YYYY-MM-DD.xlsx)
  const files = readdirSync(monthDir).filter(
    (f) => f.endsWith(".xlsx") && !/^\d{4}-\d{2}-\d{2}\.xlsx$/.test(f),
  );
  files.sort();

  if (files.length === 0) {
    log("No non-normalized files found.");
  }

  // 4. Process each file
  const renamed: string[] = [];
  const deduped: string[] = [];
  const imported: string[] = [];
  const failed: string[] = [];

  for (const file of files) {
    const filePath = join(monthDir, file);
    const tracked = isTracked(filePath);
    log(`Found: ${file}${tracked ? " (tracked)" : ""}`);

    const date = extractDate(filePath);
    if (!date) {
      log(`Date: ERROR — could not extract from filename or content`);
      failed.push(`${file} — could not extract date`);
      continue;
    }
    log(`Date: ${date}`);

    const newName = `${date}.xlsx`;
    const newPath = join(monthDir, newName);

    // --- Rename / Dedup ---
    if (file === newName) {
      log(`Rename: already normalized`);
    } else if (existsSync(newPath)) {
      // Normalized target exists — remove source (its data is already present)
      if (tracked) {
        gitRm(filePath);
        if (existsSync(filePath)) rmSync(filePath, { force: true });
      } else {
        rmSync(filePath, { force: true });
      }
      log(`Dedup: ${file} removed (${newName} exists)`);
      deduped.push(`${file} → removed (${newName} exists)`);
      continue;
    } else if (tracked) {
      if (!gitMv(filePath, newPath)) {
        log(`Rename: ERROR — git mv failed`);
        failed.push(`${file} — git mv failed`);
        continue;
      }
      log(`Git mv: ${file} → ${newName}`);
    } else {
      renameSync(filePath, newPath);
      log(`Renamed: ${file} → ${newName}`);
    }

    // --- Check import_log ---
    const { supabaseAdmin } = await import("../src/integrations/supabase/client.server");
    const { data: existing } = await supabaseAdmin
      .from("import_log")
      .select("sale_date")
      .eq("sale_date", date)
      .maybeSingle();

    if (existing) {
      log(`import_log: ${date} already imported — skip`);
      renamed.push(`${file} → ${newName} (already imported)`);
      continue;
    }

    // --- Import ---
    log(`Import: starting...`);
    const imp = exec(["bun", "run", "cli:import", newPath]);
    if (!imp.ok) {
      log(`Import: ERROR — ${imp.stderr}`);
      failed.push(`${file} → ${newName} (import error)`);
    } else {
      const lastLine = imp.stdout.split("\n").filter(Boolean).pop() || "?";
      log(`Import: ${lastLine}`);
      imported.push(`${file} → ${newName}`);
    }
  }

  // 5. Summary
  const all = [...renamed.map((s) => `REN: ${s}`), ...deduped.map((s) => `DUP: ${s}`), ...imported.map((s) => `IMP: ${s}`), ...failed.map((s) => `FAIL: ${s}`)];
  for (const p of all) log(p);

  // 6. Commit + push changes
  const hasChanges = !exec(["git", "diff", "--cached", "--quiet"]).ok || !exec(["git", "diff", "--quiet"]).ok;

  if (!hasChanges) {
    log("Git: no changes to commit");
  } else {
    // Stage all: logs + any git-moved data files (already staged by git mv)
    const filesToAdd = ["logs/import.log", "logs/cron.log"].filter((f) => existsSync(f));
    exec(["git", "add", ...filesToAdd]);

    if (exec(["git", "diff", "--cached", "--quiet"]).ok) {
      log("Git: no changes to commit (after add)");
    } else {
      const summary = [renamed.length && `${renamed.length} renamed`, deduped.length && `${deduped.length} deduped`, imported.length && `${imported.length} imported`, failed.length && `${failed.length} failed`].filter(Boolean).join(", ");
      const ts = new Date().toISOString().replace("T", " ").slice(0, 16);
      const commit = exec(["git", "commit", "-m", `import-watch: ${ts} — ${summary}`]);
      if (!commit.ok) {
        log(`Git commit: ERROR — ${commit.stderr}`);
      } else {
        log(`Git: ${commit.stdout}`);
        const push = exec(["git", "push"]);
        log(`Git push: ${push.ok ? (push.stdout || "OK") : "ERROR — " + push.stderr}`);
      }
    }
  }

  log("====== import-watch end ======");
}

main().catch((err) => {
  log(`FATAL: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
