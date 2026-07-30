import { createServerFn } from "@tanstack/react-start";
import { requireAuth } from "./auth-middleware";
import { requireRateLimit } from "./rate-limit.middleware";
import { assertAdmin } from "./admin-utils";
import { recordAudit } from "./audit";
import { RETENTION_DAYS, PURGE_CRON_LABEL, PURGE_MAX_HOURS_OVERDUE } from "./retention";
import { z } from "zod";
import db from "./db";
import { asArray, asRecord, num, dateTimeStr } from "./api-types";
import { fmtBytes } from "./utils";

type TableName =
  | "staging_sales"
  | "sales_daily_agg"
  | "products"
  | "stores"
  | "filter_hierarchy"
  | "import_log";

async function countRows(table: TableName) {
  const [rows] = await db.query("SELECT COUNT(*) AS count FROM ??", [table]);
  return num(asRecord(asArray(rows)[0]).count);
}

async function fetchDistinctDates(table: TableName, column: string) {
  const [rows] = await db.query("SELECT DISTINCT ?? FROM ?? ORDER BY ??", [column, table, column]);
  const vals = [...new Set(asArray(rows).map((r) => String(asRecord(r)[column])))].sort();
  return vals;
}

export const diagnoseData = createServerFn({ method: "GET" })
  .middleware([requireAuth, requireRateLimit()])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const tables: TableName[] = [
      "staging_sales",
      "sales_daily_agg",
      "products",
      "stores",
      "filter_hierarchy",
      "import_log",
    ];
    const counts: Record<string, number> = {};
    for (const t of tables) {
      counts[t] = await countRows(t);
    }
    const datesInSales = (await fetchDistinctDates("staging_sales", "sale_date")) as string[];
    return { ...counts, dates_in_sales: datesInSales };
  });

interface DbHealthTable {
  table: string;
  schema: string;
  total_size: number;
  total_size_pretty: string;
  row_estimate: number;
}

export interface DbHealthData {
  db_size: number;
  db_size_pretty: string;
  version: string;
  active_connections: number;
  tables: DbHealthTable[];
}

export const purgeOldAggs = createServerFn({ method: "POST" })
  .middleware([requireAuth, requireRateLimit()])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const [rows] = await db.query("CALL purge_old_aggs(?)", [RETENTION_DAYS]);
    const deleted = num(asRecord(asArray(rows)[0]).deleted);
    await recordAudit({
      action: "data.purge",
      actorId: context.userId,
      actorEmail: context.userEmail,
      targetType: "data",
      detail: `purge manual (${RETENTION_DAYS} dias) — ${deleted} registros removidos`,
    });
    return { deleted };
  });

export const dbHealthCheck = createServerFn({ method: "GET" })
  .middleware([requireAuth, requireRateLimit()])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const [rs] = await db.query("CALL db_health_check()");
    const [versionRows, sizeRows, tableRows] = rs as unknown[];
    const version = String(asRecord(asArray(versionRows)[0]).version ?? "");
    const dbSizeMb = num(asRecord(asArray(sizeRows)[0]).db_size_mb);
    const tables = asArray(tableRows).map((r) => {
      const rec = asRecord(r);
      const totalBytes = Math.round(num(rec.size_mb) * 1024 * 1024);
      return {
        table: String(rec.table_name),
        schema: "public",
        total_size: totalBytes,
        total_size_pretty: fmtBytes(totalBytes),
        row_estimate: num(rec.row_estimate),
      };
    });
    const [connRows] = await db.query("SELECT COUNT(*) AS cnt FROM information_schema.PROCESSLIST");
    const activeConnections = num(asRecord(asArray(connRows)[0]).cnt);
    return {
      db_size: Math.round(dbSizeMb * 1024 * 1024),
      db_size_pretty: fmtBytes(Math.round(dbSizeMb * 1024 * 1024)),
      version,
      active_connections: activeConnections,
      tables,
    } satisfies DbHealthData;
  });

export interface AuditRow {
  id: number;
  created_at: string;
  actor_email: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  detail: string | null;
  ip: string | null;
}

export const getAuditLog = createServerFn({ method: "POST" })
  .middleware([requireAuth, requireRateLimit()])
  .inputValidator((data: unknown) =>
    z
      .object({
        limit: z.number().int().min(1).max(100).optional(),
        offset: z.number().int().min(0).optional(),
      })
      .parse(data ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const limit = data.limit ?? 50;
    const offset = data.offset ?? 0;
    const [rows] = await db.query(
      `SELECT id, created_at, actor_email, action, target_type, target_id, detail, ip
         FROM audit_log ORDER BY id DESC LIMIT ? OFFSET ?`,
      [limit, offset],
    );
    const [countRows] = await db.query("SELECT COUNT(*) AS total FROM audit_log");
    const total = num(asRecord(asArray(countRows)[0]).total);
    const events: AuditRow[] = asArray(rows).map((r) => {
      const rec = asRecord(r);
      return {
        id: num(rec.id),
        created_at: dateTimeStr(rec.created_at),
        actor_email: rec.actor_email ? String(rec.actor_email) : null,
        action: String(rec.action ?? ""),
        target_type: rec.target_type ? String(rec.target_type) : null,
        target_id: rec.target_id ? String(rec.target_id) : null,
        detail: rec.detail ? String(rec.detail) : null,
        ip: rec.ip ? String(rec.ip) : null,
      };
    });
    return { events, total, limit, offset };
  });

/**
 * Jobs de cron conhecidos + prazo (horas) além do qual são considerados atrasados.
 *
 * O rótulo da purga interpola RETENTION_DAYS em vez de trazer o número escrito.
 * Antes era a string fixa "Purga (180 dias)" — no MESMO arquivo que já importa a
 * constante e a usa corretamente em purgeOldAggs. Bastava mudar a retenção para
 * o painel admin passar a exibir um prazo que não é o praticado. `schedule` e
 * `maxHours` seguem o mesmo raciocínio, agora como PURGE_CRON_LABEL e
 * PURGE_MAX_HOURS_OVERDUE em retention.ts — ver lá o porquê de cada valor.
 *
 * `import-watch` saiu desta lista em 2026-07-26, quando o cron dele foi
 * desligado (a importação passou a ser pela tela /upload ou sob demanda no
 * servidor). Um job SEM cron aqui fica com o último heartbeat parado no tempo e
 * é exibido como ATRASADO para sempre — alarme falso permanente, o oposto do que
 * este painel serve. A linha antiga continua na tabela cron_heartbeat como
 * registro histórico, apenas não é mais lida. Ao reativar o cron, reintroduzir o
 * job aqui E a linha em scripts/setup-crons.sh.
 */
const KNOWN_JOBS: { job: string; label: string; maxHours: number; schedule: string }[] = [
  {
    job: "purge",
    label: `Purga (${RETENTION_DAYS} dias)`,
    maxHours: PURGE_MAX_HOURS_OVERDUE,
    schedule: PURGE_CRON_LABEL,
  },
];

export interface HeartbeatRow {
  job: string;
  label: string;
  schedule: string;
  last_run_at: string | null;
  last_status: string | null;
  last_detail: string | null;
  last_duration_ms: number | null;
  /** true = nunca rodou ou passou do prazo esperado. */
  overdue: boolean;
}

export const getHeartbeats = createServerFn({ method: "GET" })
  .middleware([requireAuth, requireRateLimit()])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const [rows] = await db.query(
      `SELECT job, last_run_at, last_status, last_detail, last_duration_ms,
              TIMESTAMPDIFF(HOUR, last_run_at, NOW()) AS age_hours
         FROM cron_heartbeat`,
    );
    const byJob = new Map<string, ReturnType<typeof asRecord>>();
    for (const r of asArray(rows)) {
      const rec = asRecord(r);
      byJob.set(String(rec.job), rec);
    }
    const result: HeartbeatRow[] = KNOWN_JOBS.map((k) => {
      const rec = byJob.get(k.job);
      const lastRun = rec?.last_run_at ? dateTimeStr(rec.last_run_at) : null;
      const ageHours = rec?.age_hours == null ? null : num(rec.age_hours);
      const status = rec?.last_status ? String(rec.last_status) : null;
      const overdue =
        lastRun == null || ageHours == null || ageHours > k.maxHours || status === "fail";
      return {
        job: k.job,
        label: k.label,
        schedule: k.schedule,
        last_run_at: lastRun,
        last_status: status,
        last_detail: rec?.last_detail ? String(rec.last_detail) : null,
        last_duration_ms: rec?.last_duration_ms == null ? null : num(rec.last_duration_ms),
        overdue,
      };
    });
    return result;
  });
