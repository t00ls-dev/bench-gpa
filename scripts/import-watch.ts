#!/usr/bin/env bun
import { readdirSync, existsSync, mkdirSync, appendFileSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import { extractDate } from "./extract-date";
import db from "../src/lib/db";
import { recordHeartbeat } from "../src/lib/heartbeat";
import { RETENTION_DAYS, daysSinceUtc, isWithinRetention } from "../src/lib/retention";

const HB_JOB = "import-watch";

const LOG_FILE = "logs/import.log";

/**
 * Folder the watcher observes. It's a local INBOX, not version-controlled
 * (see .gitignore): the operator drops files here via scp/rsync. The other
 * import path is the app's /upload screen, which doesn't go through here.
 *
 * Spreadsheets used to be version-controlled and this script received them
 * via `git pull`, renamed them with `git mv`, and pushed them back with
 * `git commit`+`git push`. Git served as a data-transport medium, which
 * bloated the repository (41 MiB pack) and, the reason for the change,
 * blocked protecting the main branch: any "require pull request" rule
 * would get this automatic push rejected, and the script only logs the
 * error without marking a heartbeat failure, so it would break silently.
 */
const INBOX_DIR = "data";

function log(msg: string) {
  const ts = new Date().toISOString().replace("T", " ").slice(0, 19);
  const line = `[${ts}] ${msg}`;
  console.log(line);
  const dir = LOG_FILE.split("/")[0];
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  appendFileSync(LOG_FILE, line + "\n");
}

function exec(
  cmd: string[],
  opts?: { cwd?: string; timeout?: number },
): { ok: boolean; stdout: string; stderr: string } {
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

/**
 * All .xlsx files under `data/`, including the per-month subfolders.
 *
 * Deliberately walks the entire tree: while spreadsheets came in via git,
 * only the current month's directory was watched (`data/YYYY-MM`), because
 * the commit guaranteed the right place. In a manually-fed inbox, requiring
 * the correct subfolder would only produce the silent failure mode of
 * "I copied it and it didn't import."
 */
function listXlsx(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry.startsWith(".")) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...listXlsx(full));
    else if (entry.toLowerCase().endsWith(".xlsx")) out.push(full);
  }
  return out.sort();
}

async function main() {
  const started = Date.now();
  log("====== import-watch start ======");

  if (!existsSync(INBOX_DIR)) {
    log(`Inbox: ${INBOX_DIR}/ não existe, criando`);
    mkdirSync(INBOX_DIR, { recursive: true });
  }
  log(`Inbox: ${INBOX_DIR}/`);

  const files = listXlsx(INBOX_DIR);
  if (files.length === 0) log("Nenhum arquivo .xlsx no inbox.");

  const imported: string[] = [];
  const alreadyImported: string[] = [];
  const skippedOld: string[] = [];
  const failed: string[] = [];

  for (const filePath of files) {
    log(`Found: ${filePath}`);

    const date = extractDate(filePath);
    if (!date) {
      log(`Date: ERROR, não foi possível extrair a data de ${filePath}`);
      failed.push(`${filePath}: data não identificada`);
      continue;
    }
    log(`Date: ${date}`);

    const [rows] = await db.query("SELECT sale_date FROM import_log WHERE sale_date = ?", [date]);
    if ((Array.isArray(rows) ? rows : [])[0]) {
      // Doesn't delete it: the operator may have dropped in a corrected
      // version of the same date. Reimporting requires deleting the date
      // in admin first, their call, not this script's, which only imports
      // what doesn't exist yet.
      log(`import_log: ${date} já importado, mantido no inbox, nada a fazer`);
      alreadyImported.push(`${filePath} (${date} já importado)`);
      continue;
    }

    // Cap tied to the purge (RETENTION_DAYS): ignores files beyond the
    // retention horizon: the 3am purge would delete them from import_log
    // and the next run would reimport them, in a daily loop. Within 180
    // days, imports normally.
    const daysAgo = daysSinceUtc(date);
    if (!isWithinRetention(date)) {
      log(`Skip: ${date} além da retenção (${daysAgo}d > ${RETENTION_DAYS}d), seria purgado`);
      skippedOld.push(`${filePath} (${daysAgo}d, além da retenção)`);
      continue;
    }

    log(`Import: starting...`);
    const imp = exec(["bun", "run", "cli:import", filePath]);
    if (!imp.ok) {
      log(`Import: ERROR: ${imp.stderr}`);
      failed.push(`${filePath} (erro na importação)`);
      continue;
    }

    const lastLine = imp.stdout.split("\n").filter(Boolean).pop() || "?";
    log(`Import: ${lastLine}`);

    // Imported: the file has served its purpose and is discarded. The
    // source of truth becomes the database, which has a daily HestiaCP
    // dump to Backblaze; if it ever needs to be rebuilt, the spreadsheets
    // can be re-downloaded from the GPA portal. Only deleted after
    // success, a failure keeps the file for retry.
    rmSync(filePath, { force: true });
    log(`Removido do inbox: ${filePath}`);
    imported.push(`${filePath} → ${date}`);
  }

  const all = [
    ...imported.map((s) => `IMP: ${s}`),
    ...alreadyImported.map((s) => `SKIP: ${s}`),
    ...skippedOld.map((s) => `OLD: ${s}`),
    ...failed.map((s) => `FAIL: ${s}`),
  ];
  for (const p of all) log(p);

  const detail =
    [
      imported.length && `${imported.length} importados`,
      alreadyImported.length && `${alreadyImported.length} já importados`,
      skippedOld.length && `${skippedOld.length} além da retenção`,
      failed.length && `${failed.length} falhas`,
    ]
      .filter(Boolean)
      .join(", ") || "nenhuma novidade";
  await recordHeartbeat(HB_JOB, failed.length ? "fail" : "ok", detail, Date.now() - started);

  log("====== import-watch end ======");
}

// Explicit process.exit(0) on success: the mysql2 pool (src/lib/db.ts,
// pulled in via recordHeartbeat) keeps sockets and timers open, so the
// event loop never drains and the process hangs in epoll_wait AFTER the
// work is done. Without this, every cron run (every 3h) left behind a
// ~55 MB bun process: 6 were found alive at the same time, ~350 MB of RAM
// on a 1.9 GB machine, which is what pushed the box into swap.
main()
  .then(() => process.exit(0))
  .catch(async (err) => {
    const msg = err instanceof Error ? err.message : String(err);
    log(`FATAL: ${msg}`);
    await recordHeartbeat(HB_JOB, "fail", `FATAL: ${msg}`);
    process.exit(1);
  });
