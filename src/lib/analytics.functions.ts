import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const FilterSchema = z.object({
  dateFrom: z.string().optional().nullable(),
  dateTo: z.string().optional().nullable(),
  stores: z.array(z.string()).optional().default([]),
  deptos: z.array(z.string()).optional().default([]),
  secoes: z.array(z.string()).optional().default([]),
  grupos: z.array(z.string()).optional().default([]),
  subgrupos: z.array(z.string()).optional().default([]),
});

type Filters = z.infer<typeof FilterSchema>;

function shiftPeriod(from: string, to: string, mode: "prev_period" | "prev_week" | "prev_month") {
  const f = new Date(from + "T00:00:00Z");
  const t = new Date(to + "T00:00:00Z");
  const days = Math.round((t.getTime() - f.getTime()) / 86400000) + 1;
  let shift = days;
  if (mode === "prev_week") shift = 7;
  if (mode === "prev_month") shift = 30;
  const nf = new Date(f.getTime() - shift * 86400000);
  const nt = new Date(t.getTime() - shift * 86400000);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { dateFrom: iso(nf), dateTo: iso(nt) };
}

async function callMetrics(supabase: any, f: Filters) {
  const { data, error } = await (supabase as any).rpc("dashboard_metrics", {
    p_date_from: f.dateFrom || null,
    p_date_to: f.dateTo || null,
    p_stores: f.stores ?? [],
    p_deptos: f.deptos ?? [],
    p_secoes: f.secoes ?? [],
    p_grupos: f.grupos ?? [],
    p_subgrupos: f.subgrupos ?? [],
  });
  if (error) throw new Error(error.message);
  const d = data as any;
  return {
    total: Number(d?.total ?? 0),
    count: Number(d?.count ?? 0),
    byStore: (d?.byStore ?? []).map((x: any) => ({ code: x.code, name: x.name, val: Number(x.val) })),
    byDepto: (d?.byDepto ?? []).map((x: any) => ({ name: x.name, val: Number(x.val) })),
    byDate: (d?.byDate ?? []).map((x: any) => ({ date: x.date, val: Number(x.val) })),
  };
}

export const getFilterOptions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ dateFrom: z.string().nullable().optional(), dateTo: z.string().nullable().optional() }).parse(d ?? {})
  )
  .handler(async ({ data, context }) => {
    const { data: res, error } = await (context.supabase as any).rpc("filter_options", {
      p_date_from: data.dateFrom || null,
      p_date_to: data.dateTo || null,
    });
    if (error) throw new Error(error.message);
    const r = res as any;
    return {
      latestDate: r?.latestDate ?? null,
      stores: r?.stores ?? [],
      deptos: r?.deptos ?? [],
      secoes: r?.secoes ?? [],
      grupos: r?.grupos ?? [],
      subgrupos: r?.subgrupos ?? [],
    };
  });

export const getDashboard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    FilterSchema.extend({
      compare: z.enum(["prev_period", "prev_week", "prev_month", "none"]).optional().default("prev_period"),
    }).parse(d)
  )
  .handler(async ({ data, context }) => {
    const current = await callMetrics(context.supabase, data);
    let previous: typeof current | null = null;
    if (data.compare !== "none" && data.dateFrom && data.dateTo) {
      const prev = shiftPeriod(data.dateFrom, data.dateTo, data.compare);
      previous = await callMetrics(context.supabase, { ...data, dateFrom: prev.dateFrom, dateTo: prev.dateTo });
    }
    return { current, previous };
  });

export const getImportedDates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("imported_dates");
    if (error) throw new Error(error.message);
    return (data ?? []) as { sale_date: string; row_count: number; imported_at: string }[];
  });

export const searchProducts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ q: z.string().min(3) }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await (context.supabase as any).rpc("product_search", { p_q: data.q.trim() });
    if (error) throw new Error(error.message);
    return (rows ?? []) as { prod_code: string; prod_name: string }[];
  });

export const getProductAnalysis = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      prodCode: z.string(),
      storeCode: z.string().optional().nullable(),
      referenceDate: z.string().optional().nullable(),
    }).parse(d)
  )
  .handler(async ({ data, context }) => {
    const { data: res, error } = await (context.supabase as any).rpc("product_analysis", {
      p_prod_code: data.prodCode,
      p_store_code: data.storeCode || null,
      p_ref_date: data.referenceDate || null,
    });
    if (error) throw new Error(error.message);
    const r = res as any;
    return {
      product: r?.product ?? null,
      refDate: r?.refDate ?? null,
      refValue: Number(r?.refValue ?? 0),
      byStore: (r?.byStore ?? []).map((x: any) => ({ code: x.code, name: x.name, val: Number(x.val) })),
      evolution: (r?.evolution ?? []).map((x: any) => ({ date: x.date, val: Number(x.val) })),
      lastFourSameWeekday: (r?.lastFourSameWeekday ?? []).map((x: any) => ({ date: x.date, val: Number(x.val) })),
      lastFourAll: (r?.lastFourAll ?? []).map((x: any) => ({ date: x.date, val: Number(x.val) })),
    };
  });
