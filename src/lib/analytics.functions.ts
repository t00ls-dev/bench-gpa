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

function applyFilters(q: any, f: Filters) {
  if (f.dateFrom) q = q.gte("sale_date", f.dateFrom);
  if (f.dateTo) q = q.lte("sale_date", f.dateTo);
  if (f.stores?.length) q = q.in("store_code", f.stores);
  if (f.deptos?.length) q = q.in("depto", f.deptos);
  if (f.secoes?.length) q = q.in("secao", f.secoes);
  if (f.grupos?.length) q = q.in("grupo", f.grupos);
  if (f.subgrupos?.length) q = q.in("subgrupo", f.subgrupos);
  return q;
}

// Page-through helper for >1000 rows
async function selectAll(supabase: any, build: (q: any) => any) {
  const out: any[] = [];
  let from = 0;
  const size = 1000;
  while (true) {
    const q = build(supabase.from("sales").select("*", { count: "exact" }).range(from, from + size - 1));
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    out.push(...data);
    if (data.length < size) break;
    from += size;
    if (from > 200_000) break;
  }
  return out;
}

export const getFilterOptions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const [stores, dates] = await Promise.all([
      supabase.from("stores").select("store_code, store_name").order("store_name"),
      supabase.from("sales").select("sale_date").order("sale_date", { ascending: false }).limit(1),
    ]);
    // Hierarchy values via distinct query (we use sales for available hierarchies)
    const { data: hierRows } = await supabase
      .from("sales")
      .select("depto, secao, grupo, subgrupo")
      .limit(5000);
    const deptos = new Set<string>();
    const secoes = new Set<string>();
    const grupos = new Set<string>();
    const subgrupos = new Set<string>();
    (hierRows ?? []).forEach((r: any) => {
      if (r.depto) deptos.add(r.depto);
      if (r.secao) secoes.add(r.secao);
      if (r.grupo) grupos.add(r.grupo);
      if (r.subgrupo) subgrupos.add(r.subgrupo);
    });
    return {
      stores: stores.data ?? [],
      latestDate: dates.data?.[0]?.sale_date ?? null,
      deptos: [...deptos].sort(),
      secoes: [...secoes].sort(),
      grupos: [...grupos].sort(),
      subgrupos: [...subgrupos].sort(),
    };
  });

function aggregate(rows: any[]) {
  let total = 0;
  const byStore = new Map<string, { name: string; val: number }>();
  const byDepto = new Map<string, number>();
  const byDate = new Map<string, number>();
  for (const r of rows) {
    const v = Number(r.val_vda) || 0;
    total += v;
    const sk = r.store_code;
    const s = byStore.get(sk);
    byStore.set(sk, { name: r.store_name, val: (s?.val ?? 0) + v });
    if (r.depto) byDepto.set(r.depto, (byDepto.get(r.depto) ?? 0) + v);
    byDate.set(r.sale_date, (byDate.get(r.sale_date) ?? 0) + v);
  }
  return {
    total,
    count: rows.length,
    byStore: [...byStore.entries()].map(([code, v]) => ({ code, name: v.name, val: v.val })).sort((a, b) => b.val - a.val),
    byDepto: [...byDepto.entries()].map(([name, val]) => ({ name, val })).sort((a, b) => b.val - a.val),
    byDate: [...byDate.entries()].map(([date, val]) => ({ date, val })).sort((a, b) => a.date.localeCompare(b.date)),
  };
}

// Compute previous comparable period for a filter range
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

export const getDashboard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    FilterSchema.extend({
      compare: z.enum(["prev_period", "prev_week", "prev_month", "none"]).optional().default("prev_period"),
    }).parse(data)
  )
  .handler(async ({ data, context }) => {
    const rows = await selectAll(context.supabase, (q) => applyFilters(q, data));
    const current = aggregate(rows);

    let previous: ReturnType<typeof aggregate> | null = null;
    if (data.compare !== "none" && data.dateFrom && data.dateTo) {
      const prev = shiftPeriod(data.dateFrom, data.dateTo, data.compare);
      const prevRows = await selectAll(context.supabase, (q) =>
        applyFilters(q, { ...data, dateFrom: prev.dateFrom, dateTo: prev.dateTo })
      );
      previous = aggregate(prevRows);
    }

    return { current, previous };
  });

export const searchProducts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ q: z.string().min(3) }).parse(data))
  .handler(async ({ data, context }) => {
    const term = data.q.trim();
    const { data: rows, error } = await context.supabase
      .from("products")
      .select("prod_code, prod_name")
      .or(`prod_name.ilike.%${term}%,prod_code.ilike.%${term}%`)
      .limit(20);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

function startOfWeekSunday(d: Date) {
  const day = d.getUTCDay(); // 0 = Sunday
  const r = new Date(d);
  r.setUTCDate(d.getUTCDate() - day);
  return r;
}

export const getProductAnalysis = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({
      prodCode: z.string(),
      referenceDate: z.string().optional().nullable(),
    }).parse(data)
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    // Reference date: latest if not provided
    let refDateStr = data.referenceDate;
    if (!refDateStr) {
      const { data: latest } = await supabase
        .from("sales")
        .select("sale_date")
        .eq("prod_code", data.prodCode)
        .order("sale_date", { ascending: false })
        .limit(1);
      refDateStr = latest?.[0]?.sale_date ?? null;
    }

    const { data: allRows } = await supabase
      .from("sales")
      .select("sale_date, store_code, store_name, val_vda")
      .eq("prod_code", data.prodCode)
      .order("sale_date", { ascending: false })
      .limit(5000);

    const { data: prod } = await supabase
      .from("products")
      .select("prod_code, prod_name")
      .eq("prod_code", data.prodCode)
      .maybeSingle();

    if (!refDateStr || !allRows) {
      return { product: prod, refDate: refDateStr, byStore: [], evolution: [], lastFourSameWeekday: [], lastFourAll: [] };
    }

    const refDate = new Date(refDateStr + "T00:00:00Z");
    const refWeekday = refDate.getUTCDay();

    // by store on reference date
    const byStoreMap = new Map<string, { name: string; val: number }>();
    for (const r of allRows) {
      if (r.sale_date === refDateStr) {
        const cur = byStoreMap.get(r.store_code);
        byStoreMap.set(r.store_code, { name: r.store_name, val: (cur?.val ?? 0) + Number(r.val_vda) });
      }
    }
    const byStore = [...byStoreMap.entries()]
      .map(([code, v]) => ({ code, name: v.name, val: v.val }))
      .sort((a, b) => b.val - a.val);

    // evolution: total per date
    const byDateMap = new Map<string, number>();
    for (const r of allRows) byDateMap.set(r.sale_date, (byDateMap.get(r.sale_date) ?? 0) + Number(r.val_vda));
    const evolution = [...byDateMap.entries()]
      .map(([date, val]) => ({ date, val }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // last 4 same weekday before refDate
    const sameWeekdayDates: string[] = [];
    for (const [d] of byDateMap) {
      const dd = new Date(d + "T00:00:00Z");
      if (dd < refDate && dd.getUTCDay() === refWeekday) sameWeekdayDates.push(d);
    }
    sameWeekdayDates.sort((a, b) => b.localeCompare(a));
    const lastFourSameWeekday = sameWeekdayDates.slice(0, 4).reverse().map((d) => ({
      date: d, val: byDateMap.get(d) ?? 0,
    }));

    // last 4 (any weekday)
    const allBefore = [...byDateMap.keys()].filter((d) => d < refDateStr).sort((a, b) => b.localeCompare(a));
    const lastFourAll = allBefore.slice(0, 4).reverse().map((d) => ({ date: d, val: byDateMap.get(d) ?? 0 }));

    return {
      product: prod,
      refDate: refDateStr,
      refValue: byDateMap.get(refDateStr) ?? 0,
      byStore,
      evolution: evolution.slice(-60),
      lastFourSameWeekday,
      lastFourAll,
    };
  });
