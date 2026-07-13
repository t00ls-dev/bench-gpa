#!/usr/bin/env bun
import { readdirSync, renameSync, existsSync, mkdirSync, appendFileSync } from "node:fs";
import { join } from "node:path";
import { extractDate } from "./extract-date";

const ROBOT_UID = "00000000-0000-0000-0000-000000000000";
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
    timeout: opts?.timeout ?? 600_000, // 10 min default
  });
  return {
    ok: result.exitCode === 0,
    stdout: result.stdout.toString().trim(),
    stderr: result.stderr.toString().trim(),
  };
}

async function main() {
  log("====== import-watch start ======");

  // 1. git pull
  log("Pull: starting...");
  const pull = exec(["git", "pull", "--rebase"]);
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
  const processed: string[] = [];
  for (const file of files) {
    const filePath = join(monthDir, file);
    log(`Found: ${file}`);

    const date = extractDate(filePath);
    if (!date) {
      log(`Date: ERROR — could not extract from filename or content`);
      processed.push(`FAIL: ${file} — could not extract date`);
      continue;
    }
    log(`Date: ${date}`);

    const newName = `${date}.xlsx`;
    const newPath = join(monthDir, newName);

    // Rename (skip if already correct name or if target exists)
    if (file === newName) {
      log(`Rename: already normalized`);
    } else {
      if (existsSync(newPath)) {
        log(`Rename: SKIP — ${newName} already exists`);
        processed.push(`SKIP: ${file} (target ${newName} exists)`);
        continue;
      }
      renameSync(filePath, newPath);
      log(`Renamed: ${file} → ${newName}`);
    }

    // Check import_log
    const { supabaseAdmin } = await import("../src/integrations/supabase/client.server");
    const { data: existing } = await supabaseAdmin
      .from("import_log")
      .select("sale_date")
      .eq("sale_date", date)
      .maybeSingle();

    if (existing) {
      log(`import_log: ${date} already imported — skip (rename only)`);
      processed.push(`OK: ${file} → ${newName} (already imported)`);
      continue;
    }

    // Import
    log(`Import: starting...`);
    const imp = exec(["bun", "run", "cli:import", newPath, "--user-id", ROBOT_UID]);
    if (!imp.ok) {
      log(`Import: ERROR — ${imp.stderr}`);
      processed.push(`FAIL: ${file} → ${newName} (import error)`);
    } else {
      const lastLine = imp.stdout.split("\n").filter(Boolean).pop() || "?";
      log(`Import: ${lastLine}`);
      processed.push(`OK: ${file} → ${newName}`);
    }
  }

  // 5. Summary
  for (const p of processed) log(p);

  // 6. Commit + push logs
  const filesToAdd = ["logs/import.log", "logs/cron.log"].filter((f) => existsSync(f));
  if (filesToAdd.length === 0) {
    log("Git: no log files to add");
  } else {
    const gitAdd = exec(["git", "add", ...filesToAdd]);
    if (!gitAdd.ok) {
      log(`Git add: ERROR — ${gitAdd.stderr}`);
    } else {
      const diffCheck = exec(["git", "diff", "--cached", "--quiet"]);
      if (diffCheck.ok) {
        log("Git: no changes to commit");
      } else {
        const ts = new Date().toISOString().replace("T", " ").slice(0, 16);
        const commit = exec(["git", "commit", "-m", `import-watch: results ${ts}`]);
        if (!commit.ok) {
          log(`Git commit: ERROR — ${commit.stderr}`);
        } else {
          log(`Git: ${commit.stdout}`);
          const push = exec(["git", "push"]);
          if (!push.ok) {
            log(`Git push: ERROR — ${push.stderr}`);
          } else {
            log(`Git push: ${push.stdout || "OK"}`);
          }
        }
      }
    }
  }

  log("====== import-watch end ======");
}

main().catch((err) => {
  log(`FATAL: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
