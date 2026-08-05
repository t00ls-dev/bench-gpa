import { createServerFn } from "@tanstack/react-start";
import { requireAuth } from "./auth-middleware";
import { requireRateLimit } from "./rate-limit.middleware";
import { assertAdmin } from "./admin-utils";
import { recordAudit } from "./audit";
import {
  RETENTION_DAYS,
  PURGE_CRON_LABEL,
  PURGE_MAX_HOURS_OVERDUE,
  REFRESH_UNIVERSE_CRON_LABEL,
  REFRESH_UNIVERSE_MAX_HOURS_OVERDUE,
} from "./retention";
import { z } from "zod";
import db from "./db";
import { asArray, asRecord, num, dateTimeStr } from "./api-types";
import { fmtBytes } from "./utils";

type TableName =
  "staging_sales" | "sales_daily_agg" | "products" | "stores" | "filter_hierarchy" | "import_log";

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
    const [countsList, datesInSales] = await Promise.all([
      Promise.all(tables.map((t) => countRows(t))),
      fetchDistinctDates("staging_sales", "sale_date") as Promise<string[]>,
    ]);
    const counts: Record<string, number> = {};
    tables.forEach((t, i) => {
      counts[t] = countsList[i];
    });
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
      actorUsername: context.userUsername,
      targetType: "data",
      detail: `purge manual (${RETENTION_DAYS} dias), ${deleted} registros removidos`,
    });
    return { deleted };
  });

export const dbHealthCheck = createServerFn({ method: "GET" })
  .middleware([requireAuth, requireRateLimit()])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const [[rs], [connRows]] = await Promise.all([
      db.query("CALL db_health_check()"),
      db.query("SELECT COUNT(*) AS cnt FROM information_schema.PROCESSLIST"),
    ]);
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
  actor_username: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  /** Target user's current username (JOIN on `users`), null if the target isn't a user or no longer exists. */
  target_username: string | null;
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
    const [[rows], [countRows]] = await Promise.all([
      db.query(
        // LEFT JOIN instead of relying on text stored in `detail`: resolves
        // the target's username by target_id for any row, including ones
        // recorded before this feature existed. Always the CURRENT username
        // (updateUserIdentifiers allows editing after the event was recorded).
        `SELECT a.id, a.created_at, a.actor_username, a.action, a.target_type, a.target_id,
                u.username AS target_username, a.detail, a.ip
           FROM audit_log a
           LEFT JOIN users u ON a.target_type = 'user' AND a.target_id = u.id
           ORDER BY a.id DESC LIMIT ? OFFSET ?`,
        [limit, offset],
      ),
      db.query("SELECT COUNT(*) AS total FROM audit_log"),
    ]);
    const total = num(asRecord(asArray(countRows)[0]).total);
    const events: AuditRow[] = asArray(rows).map((r) => {
      const rec = asRecord(r);
      return {
        id: num(rec.id),
        created_at: dateTimeStr(rec.created_at),
        actor_username: rec.actor_username ? String(rec.actor_username) : null,
        action: String(rec.action ?? ""),
        target_type: rec.target_type ? String(rec.target_type) : null,
        target_id: rec.target_id ? String(rec.target_id) : null,
        target_username: rec.target_username ? String(rec.target_username) : null,
        detail: rec.detail ? String(rec.detail) : null,
        ip: rec.ip ? String(rec.ip) : null,
      };
    });
    return { events, total, limit, offset };
  });

/**
 * Known cron jobs + deadline (hours) beyond which they're considered overdue.
 *
 * The purge label interpolates RETENTION_DAYS instead of a hardcoded number.
 * It used to be the fixed string "Purga (180 dias)", in the SAME file that
 * already imports the constant and uses it correctly in purgeOldAggs. All
 * it took was changing the retention for the admin panel to show a deadline
 * that no longer matched reality. `schedule` and `maxHours` follow the same
 * reasoning, now as PURGE_CRON_LABEL and PURGE_MAX_HOURS_OVERDUE in
 * retention.ts: see there for why each value is what it is.
 *
 * `import-watch` left this list on 2026-07-26, when its cron was turned off
 * (importing moved to the /upload screen or on-demand on the server). A job
 * with NO cron here has its last heartbeat frozen in time and shows up as
 * OVERDUE forever: a permanent false alarm, the opposite of what this panel
 * is for. The old row still lives in the cron_heartbeat table as a
 * historical record, it just isn't read anymore. If the cron is reactivated,
 * reintroduce the job here AND the line in scripts/setup-crons.sh.
 */
const KNOWN_JOBS: {
  job: string;
  label: string;
  /** Full text for the tooltip, when the label is abbreviated (see HeartbeatCard). */
  hint?: string;
  maxHours: number;
  schedule: string;
}[] = [
  {
    job: "purge",
    // Deliberately short: the full label (in hint) broke the status badge
    // next to it on the card (see admin-audit-panel.tsx).
    label: "Limpeza de dados antigos",
    hint: `Remove agregados de vendas (diários e por produto) e logs de importação com mais de ${RETENTION_DAYS} dias, mantendo o banco otimizado sem afetar dados recentes.`,
    maxHours: PURGE_MAX_HOURS_OVERDUE,
    schedule: PURGE_CRON_LABEL,
  },
  {
    job: "refresh-universe",
    label: "Produtos e filtros",
    hint: "Atualiza a lista de produtos e a hierarquia de departamento/seção/grupo/subgrupo usada nos filtros do Dashboard e da Área.",
    maxHours: REFRESH_UNIVERSE_MAX_HOURS_OVERDUE,
    schedule: REFRESH_UNIVERSE_CRON_LABEL,
  },
];

export interface HeartbeatRow {
  job: string;
  label: string;
  hint: string | null;
  schedule: string;
  last_run_at: string | null;
  last_status: string | null;
  last_detail: string | null;
  last_duration_ms: number | null;
  /** true = never ran, or past the expected deadline. */
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
        hint: k.hint ?? null,
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
