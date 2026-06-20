import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const NameSchema = z.string().trim().min(1, "Nome obrigatório").max(120);

export const listCustomAnalyses = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("custom_analyses")
      .select("id,name,created_at,updated_at,custom_analysis_items(count)")
      .order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []).map((r: any) => ({
      id: r.id as string,
      name: r.name as string,
      created_at: r.created_at as string,
      updated_at: r.updated_at as string,
      itemCount: (r.custom_analysis_items?.[0]?.count ?? 0) as number,
    }));
  });

export const createCustomAnalysis = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ name: NameSchema }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("custom_analyses")
      .insert({ name: data.name, user_id: context.userId })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row!.id as string };
  });

export const renameCustomAnalysis = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid(), name: NameSchema }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("custom_analyses")
      .update({ name: data.name })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteCustomAnalysis = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("custom_analyses").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const duplicateCustomAnalysis = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const supabase = context.supabase;
    const { data: src, error: e1 } = await supabase
      .from("custom_analyses").select("name").eq("id", data.id).single();
    if (e1) throw new Error(e1.message);
    const { data: items, error: e2 } = await supabase
      .from("custom_analysis_items").select("prod_code").eq("analysis_id", data.id);
    if (e2) throw new Error(e2.message);
    const { data: dup, error: e3 } = await supabase
      .from("custom_analyses")
      .insert({ name: `${src!.name} (cópia)`, user_id: context.userId })
      .select("id").single();
    if (e3) throw new Error(e3.message);
    if ((items ?? []).length) {
      const { error: e4 } = await supabase
        .from("custom_analysis_items")
        .insert((items ?? []).map((it: any) => ({ analysis_id: dup!.id, prod_code: it.prod_code })));
      if (e4) throw new Error(e4.message);
    }
    return { id: dup!.id as string };
  });

export const getCustomAnalysis = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const supabase = context.supabase;
    const { data: a, error: e1 } = await supabase
      .from("custom_analyses").select("id,name,updated_at").eq("id", data.id).single();
    if (e1) throw new Error(e1.message);
    const { data: items, error: e2 } = await supabase
      .from("custom_analysis_items").select("prod_code,created_at")
      .eq("analysis_id", data.id).order("created_at", { ascending: false });
    if (e2) throw new Error(e2.message);
    const codes = (items ?? []).map((i: any) => i.prod_code as string);
    let products: Record<string, any> = {};
    let hierarchy: Record<string, any> = {};
    if (codes.length) {
      const { data: prods } = await supabase
        .from("products").select("prod_code,prod_name").in("prod_code", codes);
      for (const p of prods ?? []) products[(p as any).prod_code] = p;
      const { data: hier } = await supabase
        .from("sales").select("prod_code,depto,secao,grupo,subgrupo,sale_date")
        .in("prod_code", codes).order("sale_date", { ascending: false }).limit(codes.length * 4);
      for (const h of hier ?? []) {
        if (!hierarchy[(h as any).prod_code]) hierarchy[(h as any).prod_code] = h;
      }
    }
    return {
      id: a!.id as string,
      name: a!.name as string,
      updated_at: a!.updated_at as string,
      items: (items ?? []).map((i: any) => {
        const p = products[i.prod_code];
        const h = hierarchy[i.prod_code] ?? {};
        return {
          prod_code: i.prod_code as string,
          prod_name: (p?.prod_name ?? null) as string | null,
          exists_in_base: !!p,
          depto: h.depto ?? null,
          secao: h.secao ?? null,
          grupo: h.grupo ?? null,
          subgrupo: h.subgrupo ?? null,
        };
      }),
    };
  });

export const addProductToAnalysis = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), prodCode: z.string().trim().min(1).max(40) }).parse(d)
  )
  .handler(async ({ data, context }) => {
    const supabase = context.supabase;
    const { data: prod } = await supabase
      .from("products").select("prod_code,prod_name").eq("prod_code", data.prodCode).maybeSingle();
    if (!prod) throw new Error(`PLU ${data.prodCode} não encontrado na base.`);
    const { error } = await supabase
      .from("custom_analysis_items")
      .insert({ analysis_id: data.id, prod_code: data.prodCode });
    if (error) {
      if (error.code === "23505") throw new Error("Este PLU já está na análise.");
      throw new Error(error.message);
    }
    return { prod_code: (prod as any).prod_code as string, prod_name: (prod as any).prod_name as string };
  });

export const removeProductFromAnalysis = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), prodCode: z.string() }).parse(d)
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("custom_analysis_items").delete()
      .eq("analysis_id", data.id).eq("prod_code", data.prodCode);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getCustomAnalysisResults = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      id: z.string().uuid(),
      dateFrom: z.string(),
      dateTo: z.string(),
      stores: z.array(z.string()).optional().default([]),
      deptos: z.array(z.string()).optional().default([]),
      secoes: z.array(z.string()).optional().default([]),
      grupos: z.array(z.string()).optional().default([]),
      subgrupos: z.array(z.string()).optional().default([]),
    }).parse(d)
  )
  .handler(async ({ data, context }) => {
    const { data: res, error } = await (context.supabase as any).rpc("custom_analysis_results", {
      p_analysis_id: data.id,
      p_date_from: data.dateFrom,
      p_date_to: data.dateTo,
      p_stores: data.stores ?? [],
      p_deptos: data.deptos ?? [],
      p_secoes: data.secoes ?? [],
      p_grupos: data.grupos ?? [],
      p_subgrupos: data.subgrupos ?? [],
    });
    if (error) throw new Error(error.message);
    const r = res as any;
    return {
      total: Number(r?.total ?? 0),
      plusTotal: Number(r?.plusTotal ?? 0),
      plusWithSale: Number(r?.plusWithSale ?? 0),
      plusWithoutSale: Number(r?.plusWithoutSale ?? 0),
      avgPerPlu: Number(r?.avgPerPlu ?? 0),
      products: ((r?.products ?? []) as any[]).map((p) => ({
        prod_code: String(p.prod_code),
        prod_name: String(p.prod_name ?? ""),
        depto: p.depto ?? null,
        secao: p.secao ?? null,
        grupo: p.grupo ?? null,
        subgrupo: p.subgrupo ?? null,
        val: Number(p.val ?? 0),
        qty: Number(p.qty ?? 0),
        exists_in_base: !!p.exists_in_base,
      })),
    };
  });
