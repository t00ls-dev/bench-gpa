import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireRateLimit } from "./rate-limit.middleware";
import { safeError } from "./safe-error";
import { assertAdmin } from "./admin-utils";
import { z } from "zod";
import { EmailSchema, PasswordSchema, RoleEnum, UserIdSchema, SingleSlugSchema } from "./schemas";

export const listUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth, requireRateLimit])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("users")
      .select("id, email, name, role, is_active, created_at")
      .order("created_at", { ascending: false });
    if (error)
      throw safeError("listUsers", error, "Ocorreu um erro interno. Tente novamente.", true);
    return data ?? [];
  });

export const createUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireRateLimit])
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
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: created, error: authErr } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
    });
    if (authErr || !created?.user)
      throw safeError("createUser.auth", authErr, "Falha ao criar usuário.", true);

    const { error: insErr } = await supabaseAdmin.from("users").insert({
      id: created.user.id,
      email: data.email,
      name: data.name,
      role: data.role,
      is_active: true,
    });
    if (insErr) {
      // rollback: apaga auth user órfão
      await supabaseAdmin.auth.admin.deleteUser(created.user.id).catch(() => {});
      throw safeError("createUser.insert", insErr, "Falha ao salvar usuário.", true);
    }
    return { ok: true, id: created.user.id };
  });

export const setUserRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireRateLimit])
  .inputValidator((data: unknown) =>
    z.object({ userId: UserIdSchema, role: RoleEnum }).parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    if (context.userId === data.userId && data.role !== "admin") {
      throw new Error("Você não pode remover seu próprio acesso de administrador.");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("users")
      .update({ role: data.role })
      .eq("id", data.userId);
    if (error)
      throw safeError("setUserRole", error, "Ocorreu um erro interno. Tente novamente.", true);
    return { ok: true };
  });

export const setUserActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireRateLimit])
  .inputValidator((data: unknown) =>
    z.object({ userId: UserIdSchema, isActive: z.boolean() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    if (context.userId === data.userId && !data.isActive) {
      throw new Error("Você não pode inativar sua própria conta.");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("users")
      .update({ is_active: data.isActive })
      .eq("id", data.userId);
    if (error)
      throw safeError("setUserActive", error, "Ocorreu um erro interno. Tente novamente.", true);
    return { ok: true };
  });

export const resetPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireRateLimit])
  .inputValidator((data: unknown) =>
    z.object({ userId: UserIdSchema, password: PasswordSchema }).parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.userId, {
      password: data.password,
    });
    if (error)
      throw safeError("resetPassword", error, "Ocorreu um erro interno. Tente novamente.", true);
    return { ok: true };
  });

type TableName =
  | "staging_sales"
  | "sales_daily_agg"
  | "products"
  | "stores"
  | "filter_hierarchy"
  | "import_log";

async function countRows(
  sa: Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"],
  table: TableName,
) {
  const { count, error } = await sa.from(table).select("*", { count: "exact", head: false });
  if (error) throw safeError(`count.${table}`, error, undefined, true);
  return count ?? 0;
}

async function fetchDistinctDates(
  sa: Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"],
  table: TableName,
  column: string,
) {
  const { data, error } = await sa.from(table).select(column);
  if (error) throw safeError(`distinct.${table}.${column}`, error, undefined, true);
  const vals = [
    ...new Set((data ?? []).map((r) => String((r as unknown as Record<string, unknown>)[column]))),
  ].sort();
  return vals;
}

export const diagnoseData = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth, requireRateLimit])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
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
      try {
        counts[t] = await countRows(supabaseAdmin, t);
      } catch (e) {
        throw e;
      }
    }
    const datesInSales = await fetchDistinctDates(supabaseAdmin, "staging_sales", "sale_date");
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
  free_limit: number;
  free_limit_pretty: string;
  pct_used: number;
  version: string;
  active_connections: number;
  tables: DbHealthTable[];
}

export const purgeOldAggs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireRateLimit])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.rpc("purge_old_aggs", { p_days: 28 });
    if (error) throw safeError("purgeOldAggs", error, undefined, true);
    return { deleted: data };
  });

export const dbHealthCheck = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth, requireRateLimit])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await (supabaseAdmin.rpc as any)("db_health_check");
    if (error) throw safeError("dbHealthCheck", error, undefined, true);
    return data as unknown as DbHealthData;
  });

interface DocEntry {
  slug: string;
  title: string;
  category: string;
  date: string;
}

const docModules = import.meta.glob("/docs/**/*.md", {
  eager: true,
  query: "?raw",
  import: "default",
}) as Record<string, string>;

export const listDocs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth, requireRateLimit])
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
      entries.push({ slug, title, category, date });
    }
    entries.sort((a, b) => a.title.localeCompare(b.title, "pt-BR"));
    return entries;
  });

export const getDocContent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireRateLimit])
  .inputValidator((data: unknown) => SingleSlugSchema.parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const content = docModules[`/docs/${data.slug}.md`];
    if (!content) throw new Error("Documento não encontrado.");
    return content;
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
