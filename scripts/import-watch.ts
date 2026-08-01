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
 * Pasta que o watcher observa. É um INBOX local, não versionada (ver .gitignore):
 * quem coloca arquivo aqui é o operador, via scp/rsync. O outro caminho de
 * importação é a tela /upload do app, que não passa por aqui.
 *
 * Antes as planilhas eram versionadas e este script as recebia por `git pull`,
 * renomeava com `git mv` e devolvia com `git commit`+`git push`. O git servia de
 * meio de transporte de dados, o que inchava o repositório (41 MiB de pack) e,
 * o que motivou a mudança, impedia proteger a branch main: qualquer regra de
 * "exigir pull request" faria este push automático ser recusado, e o script só
 * registra o erro no log sem marcar falha no heartbeat, então quebraria calado.
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
 * Todos os .xlsx sob `data/`, incluindo as subpastas por mês.
 *
 * Varre a árvore inteira de propósito: enquanto as planilhas vinham pelo git, só
 * o diretório do mês corrente era observado (`data/YYYY-MM`), porque o commit
 * garantia o lugar certo. Num inbox alimentado à mão, exigir a subpasta correta
 * só produziria o silêncio de "copiei e não importou".
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
      // Não apaga: o operador pode ter colocado uma versão corrigida da mesma
      // data. Reimportar exige apagar a data no admin antes, decisão dele, não
      // deste script, que só importa o que ainda não existe.
      log(`import_log: ${date} já importado, mantido no inbox, nada a fazer`);
      alreadyImported.push(`${filePath} (${date} já importado)`);
      continue;
    }

    // Cap atrelado ao purge (RETENTION_DAYS): ignora arquivos além do horizonte
    // de retenção: o purge das 3h os apagaria da import_log e a rodada seguinte
    // os reimportaria, num loop diário. Dentro de 180 dias, importa normalmente.
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

    // Importou: o arquivo cumpriu seu papel e é descartado. A fonte de verdade
    // passa a ser o banco, que tem dump diário do HestiaCP para o Backblaze; se
    // um dia for preciso reconstruir, as planilhas são rebaixáveis do portal do
    // GPA. Só se apaga depois do sucesso, falha mantém o arquivo para retry.
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

// process.exit(0) explícito no sucesso: o pool do mysql2 (src/lib/db.ts, puxado
// via recordHeartbeat) mantém sockets e timers abertos, então o event loop nunca
// esvazia e o processo fica pendurado em epoll_wait DEPOIS de terminar o
// trabalho. Sem isto, cada rodada do cron (a cada 3h) deixava para trás um bun
// de ~55 MB: foram encontrados 6 vivos ao mesmo tempo, ~350 MB de RAM numa
// máquina de 1,9 GB, que é o que empurrava a caixa para o swap.
main()
  .then(() => process.exit(0))
  .catch(async (err) => {
    const msg = err instanceof Error ? err.message : String(err);
    log(`FATAL: ${msg}`);
    await recordHeartbeat(HB_JOB, "fail", `FATAL: ${msg}`);
    process.exit(1);
  });
