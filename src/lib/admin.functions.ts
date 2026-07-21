import { createServerFn } from "@tanstack/react-start";
import { requireAuth } from "./auth-middleware";
import { requireRateLimit } from "./rate-limit.middleware";
import { assertAdmin } from "./admin-utils";
import { z } from "zod";
import bcrypt from "bcrypt";
import db from "./db";
import { EmailSchema, PasswordSchema, RoleEnum, UserIdSchema, SingleSlugSchema } from "./schemas";
import docMeta from "@/generated/doc-meta.json";

export const listUsers = createServerFn({ method: "GET" })
  .middleware([requireAuth, requireRateLimit])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const [rows] = await db.query(
      "SELECT id, email, name, role, is_active, created_at FROM users ORDER BY created_at DESC",
    );
    return rows as {
      id: string;
      email: string;
      name: string;
      role: string;
      is_active: boolean;
      created_at: string;
    }[];
  });

export const createUser = createServerFn({ method: "POST" })
  .middleware([requireAuth, requireRateLimit])
  .inputValidator((data: unknown) =>
    z
      .object({
        email: EmailSchema,
        name: z.string().trim().min(1, "Nome obrigatório").max(120),
        password: PasswordSchema,
        role: RoleEnum,
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const hash = await bcrypt.hash(data.password, 12);
    const id = crypto.randomUUID();
    await db.query(
      "INSERT INTO users (id, email, name, password, role, is_active) VALUES (?, ?, ?, ?, ?, TRUE)",
      [id, data.email, data.name, hash, data.role],
    );
    return { ok: true, id };
  });

export const setUserRole = createServerFn({ method: "POST" })
  .middleware([requireAuth, requireRateLimit])
  .inputValidator((data: unknown) => z.object({ userId: UserIdSchema, role: RoleEnum }).parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    if (context.userId === data.userId && data.role !== "admin") {
      throw new Error("Você não pode remover seu próprio acesso de administrador.");
    }
    await db.query("UPDATE users SET role = ? WHERE id = ?", [data.role, data.userId]);
    return { ok: true };
  });

export const setUserActive = createServerFn({ method: "POST" })
  .middleware([requireAuth, requireRateLimit])
  .inputValidator((data: unknown) =>
    z.object({ userId: UserIdSchema, isActive: z.boolean() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    if (context.userId === data.userId && !data.isActive) {
      throw new Error("Você não pode inativar sua própria conta.");
    }
    await db.query("UPDATE users SET is_active = ? WHERE id = ?", [data.isActive, data.userId]);
    return { ok: true };
  });

export const resetPassword = createServerFn({ method: "POST" })
  .middleware([requireAuth, requireRateLimit])
  .inputValidator((data: unknown) =>
    z.object({ userId: UserIdSchema, password: PasswordSchema }).parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const hash = await bcrypt.hash(data.password, 12);
    await db.query("UPDATE users SET password = ? WHERE id = ?", [hash, data.userId]);
    return { ok: true };
  });

type TableName =
  | "staging_sales"
  | "sales_daily_agg"
  | "products"
  | "stores"
  | "filter_hierarchy"
  | "import_log";

async function countRows(table: TableName) {
  const [rows] = await db.query("SELECT COUNT(*) AS count FROM ??", [table]);
  return Number((rows as any[])[0]?.count ?? 0);
}

async function fetchDistinctDates(table: TableName, column: string) {
  const [rows] = await db.query("SELECT DISTINCT ?? FROM ?? ORDER BY ??", [column, table, column]);
  const vals = [...new Set((rows ?? []).map((r: any) => String(r[column])))].sort();
  return vals;
}

export const diagnoseData = createServerFn({ method: "GET" })
  .middleware([requireAuth, requireRateLimit])
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
    const datesInSales = await fetchDistinctDates("staging_sales", "sale_date");
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
  .middleware([requireAuth, requireRateLimit])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const [rows] = await db.query("CALL purge_old_aggs(?)", [180]);
    return { deleted: Number((rows as any[])[0]?.deleted ?? 0) };
  });

export const dbHealthCheck = createServerFn({ method: "GET" })
  .middleware([requireAuth, requireRateLimit])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const [rs] = await db.query("CALL db_health_check()");
    const [versionRows, sizeRows, tableRows] = rs;
    const version = String((versionRows as any[])[0]?.version ?? "");
    const dbSizeMb = Number((sizeRows as any[])[0]?.db_size_mb ?? 0);
    const tables = (tableRows ?? []).map((r: any) => ({
      table: String(r.table_name),
      schema: "public",
      total_size: Math.round(Number(r.size_mb) * 1024 * 1024),
      total_size_pretty: `${r.size_mb} MB`,
      row_estimate: Number(r.row_estimate ?? 0),
    }));
    const [connRows] = await db.query(
      "SELECT COUNT(*) AS cnt FROM information_schema.PROCESSLIST",
    );
    const activeConnections = Number((connRows as any[])[0]?.cnt ?? 0);
    return {
      db_size: Math.round(dbSizeMb * 1024 * 1024),
      db_size_pretty: `${dbSizeMb.toFixed(1)} MB`,
      version,
      active_connections: activeConnections,
      tables,
    } satisfies DbHealthData;
  });

interface DocEntry {
  slug: string;
  title: string;
  category: string;
  date: string;
  lastModified: number | null;
}

const docModules = import.meta.glob("/docs/**/*.md", {
  eager: true,
  query: "?raw",
  import: "default",
}) as Record<string, string>;

export const listDocs = createServerFn({ method: "GET" })
  .middleware([requireAuth, requireRateLimit])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const entries: DocEntry[] = [];
    for (const [filePath, content] of Object.entries(docModules)) {
      const slug = filePath.replace(/^\/docs\//, "").replace(/\.md$/, "");
      if (slug === "improvements/README") continue;
      const title =
        extractDocTitle(content) ??
        slug.replace(/[/_-]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
      const date = extractDocDate(content) ?? "";
      const category = slug.startsWith("improvements/")
        ? "Análise do Código"
        : "Documentação Técnica";
      const lastModified = (docMeta as Record<string, number | null>)[filePath] ?? null;
      entries.push({ slug, title, category, date, lastModified });
    }
    entries.sort((a, b) => a.title.localeCompare(b.title, "pt-BR"));
    return entries;
  });

export const getDocContent = createServerFn({ method: "POST" })
  .middleware([requireAuth, requireRateLimit])
  .inputValidator((data: unknown) => SingleSlugSchema.parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const filePath = `/docs/${data.slug}.md`;
    const content = docModules[filePath];
    if (!content) throw new Error("Documento não encontrado.");
    const lastModified = (docMeta as Record<string, number | null>)[filePath] ?? null;
    return { content, lastModified };
  });

function extractDocTitle(content: string): string | null {
  const m = content.match(/^#\s+(.+)/m);
  return m ? m[1].trim() : null;
}

function extractDocDate(content: string): string | null {
  const dm = content.match(/(\d{2}\/\d{2}\/\d{4})/);
  if (dm) return dm[1];
  const mm = content.match(/(\w{3,4}o?\/\d{4})/i);
  if (mm) return mm[1].replace(/^(\w)/, (c) => c.toUpperCase());
  return null;
}
