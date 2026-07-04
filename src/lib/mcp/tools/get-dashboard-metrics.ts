import { createClient } from "@supabase/supabase-js";
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";

function supabaseForUser(ctx: ToolContext) {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export default defineTool({
  name: "get_dashboard_metrics",
  title: "Get dashboard metrics",
  description:
    "Get total sales plus breakdowns by store, department, and date for a filtered period. Filters (stores, deptos, secoes, grupos, subgrupos) are optional arrays of names/codes.",
  inputSchema: {
    dateFrom: z.string().optional().describe("Start date YYYY-MM-DD."),
    dateTo: z.string().optional().describe("End date YYYY-MM-DD."),
    stores: z.array(z.string()).optional().describe("Store codes to include."),
    deptos: z.array(z.string()).optional().describe("Department names to include."),
    secoes: z.array(z.string()).optional().describe("Section names to include."),
    grupos: z.array(z.string()).optional().describe("Group names to include."),
    subgrupos: z.array(z.string()).optional().describe("Subgroup names to include."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (input, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase.rpc("dashboard_metrics", {
      p_date_from: input.dateFrom || (null as unknown as string),
      p_date_to: input.dateTo || (null as unknown as string),
      p_stores: input.stores ?? [],
      p_deptos: input.deptos ?? [],
      p_secoes: input.secoes ?? [],
      p_grupos: input.grupos ?? [],
      p_subgrupos: input.subgrupos ?? [],
    });
    if (error) {
      return { content: [{ type: "text", text: error.message }], isError: true };
    }
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? {}) }],
      structuredContent: { metrics: data ?? {} },
    };
  },
});
