#!/usr/bin/env bun
import { readdirSync, renameSync, existsSync, mkdirSync, appendFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { extractDate } from "./extract-date";
import db from "../src/lib/db";
import { recordHeartbeat } from "../src/lib/heartbeat";
import { RETENTION_DAYS, daysSinceUtc, isWithinRetention } from "../src/lib/retention";

const HB_JOB = "import-watch";

const LOG_FILE = "logs/import.log";

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
  const started = Date.now();
  log("====== import-watch start ======");

  // 1. git pull
  log("Pull: starting...");
  const pull = exec(["git", "pull", "--rebase", "--autostash"]);
  if (!pull.ok) {
    log(`Pull: ERROR — ${pull.stderr}`);
    log("====== import-watch abort ======");
    await recordHeartbeat(HB_JOB, "fail", `git pull falhou: ${pull.stderr}`, Date.now() - started);
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

  // 3. List all .xlsx files
  const allFiles = readdirSync(monthDir).filter((f) => f.endsWith(".xlsx"));
  allFiles.sort();

  if (allFiles.length === 0) {
    log("No xlsx files found.");
  }

  // 4. Process each file
  const alreadyImported: string[] = [];
  const deduped: string[] = [];
  const imported: string[] = [];
  const skippedOld: string[] = [];
  const failed: string[] = [];
  let fileOps = false;

  for (const file of allFiles) {
    const filePath = join(monthDir, file);
    const tracked = isTracked(filePath);
    const normalized = /^\d{4}-\d{2}-\d{2}\.xlsx$/.test(file);

    log(`Found: ${file}${tracked ? " (tracked)" : ""}${normalized ? " (normalized)" : ""}`);

    // Extract date: from normalized name or via extractDate
    let date: string | null;
    if (normalized) {
      date = file.slice(0, 10);
    } else {
      date = extractDate(filePath);
    }

    if (!date) {
      log(`Date: ERROR — could not extract from ${file}`);
      failed.push(`${file} — could not extract date`);
      continue;
    }
    log(`Date: ${date}`);

    const newName = `${date}.xlsx`;
    const newPath = join(monthDir, newName);

    // --- Rename / Dedup (only for non-normalized) ---
    if (!normalized) {
      if (file === newName) {
        log(`Rename: already normalized`);
      } else if (existsSync(newPath)) {
        if (tracked) {
          gitRm(filePath);
          if (existsSync(filePath)) rmSync(filePath, { force: true });
        } else {
          rmSync(filePath, { force: true });
        }
        fileOps = true;
        log(`Dedup: ${file} removed (${newName} exists)`);
        deduped.push(`${file} → removed (${newName} exists)`);
        continue;
      } else if (tracked) {
        if (!gitMv(filePath, newPath)) {
          log(`Rename: ERROR — git mv failed`);
          failed.push(`${file} — git mv failed`);
          continue;
        }
        fileOps = true;
        log(`Git mv: ${file} → ${newName}`);
      } else {
        fileOps = true;
        renameSync(filePath, newPath);
        log(`Renamed: ${file} → ${newName}`);
      }
    }

    // --- Check import_log (for all files) ---
    const [rows] = await db.query("SELECT sale_date FROM import_log WHERE sale_date = ?", [date]);
    const existing = (Array.isArray(rows) ? rows : [])[0];

    if (existing) {
      log(`import_log: ${date} already imported — skip`);
      alreadyImported.push(`${file} → ${newName} (already imported)`);
      continue;
    }

    // Cap atrelado ao purge (RETENTION_DAYS): ignora arquivos além do horizonte
    // de retenção — o purge das 3h os apagaria da import_log e a rodada seguinte
    // os reimportaria, num loop diário. Dentro de 180 dias, importa normalmente.
    const daysAgo = daysSinceUtc(date);
    if (!isWithinRetention(date)) {
      log(`Skip: ${date} além da retenção (${daysAgo}d > ${RETENTION_DAYS}d) — seria purgado`);
      skippedOld.push(`${file} → ${newName} (${daysAgo}d, além da retenção)`);
      continue;
    }

    // --- Import ---
    fileOps = true;
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
  const all = [
    ...alreadyImported.map((s) => `SKIP: ${s}`),
    ...deduped.map((s) => `DUP: ${s}`),
    ...imported.map((s) => `IMP: ${s}`),
    ...skippedOld.map((s) => `OLD: ${s}`),
    ...failed.map((s) => `FAIL: ${s}`),
  ];
  for (const p of all) log(p);

  // 6. Commit + push se houve operações em arquivos
  const hasOps = fileOps;

  if (!hasOps) {
    log("Git: no file operations — skip commit");
  } else {
    exec(["git", "add", "logs/import.log"]);
    const summary = [
      alreadyImported.length && `${alreadyImported.length} already-imported`,
      deduped.length && `${deduped.length} deduped`,
      imported.length && `${imported.length} imported`,
      skippedOld.length && `${skippedOld.length} skipped-old`,
      failed.length && `${failed.length} failed`,
    ]
      .filter(Boolean)
      .join(", ");
    const ts = new Date().toISOString().replace("T", " ").slice(0, 16);
    const commit = exec(["git", "commit", "-m", `import-watch: ${ts} — ${summary}`]);
    if (!commit.ok) {
      log(`Git commit: ERROR — ${commit.stderr}`);
    } else {
      log(`Git: ${commit.stdout}`);
      const push = exec(["git", "push"]);
      log(`Git push: ${push.ok ? push.stdout || "OK" : "ERROR — " + push.stderr}`);
    }
  }

  const detail =
    [
      imported.length && `${imported.length} importados`,
      alreadyImported.length && `${alreadyImported.length} já importados`,
      deduped.length && `${deduped.length} deduplicados`,
      skippedOld.length && `${skippedOld.length} além da retenção`,
      failed.length && `${failed.length} falhas`,
    ]
      .filter(Boolean)
      .join(", ") || "nenhuma novidade";
  await recordHeartbeat(HB_JOB, failed.length ? "fail" : "ok", detail, Date.now() - started);

  log("====== import-watch end ======");
}

// process.exit(0) explícito no sucesso: o pool do mysql2 (src/lib/db.ts, puxado
// via recordHeartbeat) mantém sockets e timers abertos, então o event loop nunca
// esvazia e o processo fica pendurado em epoll_wait DEPOIS de terminar o
// trabalho. Sem isto, cada rodada do cron (a cada 3h) deixava para trás um bun
// de ~55 MB: foram encontrados 6 vivos ao mesmo tempo, ~350 MB de RAM numa
// máquina de 1,9 GB — que é o que empurrava a caixa para o swap.
//
// O import.ts e o purge-aggs.ts já faziam isso; só este caminho tinha exit
// apenas nos ramos de erro.
main()
  .then(() => process.exit(0))
  .catch(async (err) => {
    const msg = err instanceof Error ? err.message : String(err);
    log(`FATAL: ${msg}`);
    await recordHeartbeat(HB_JOB, "fail", `FATAL: ${msg}`);
    process.exit(1);
  });
