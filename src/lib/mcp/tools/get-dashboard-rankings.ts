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
  name: "get_dashboard_rankings",
  title: "Get sales rankings",
  description:
    "Get top rankings by department, section, group, subgroup, and product for a filtered period.",
  inputSchema: {
    dateFrom: z.string().optional().describe("Start date YYYY-MM-DD."),
    dateTo: z.string().optional().describe("End date YYYY-MM-DD."),
    stores: z.array(z.string()).optional(),
    deptos: z.array(z.string()).optional(),
    secoes: z.array(z.string()).optional(),
    grupos: z.array(z.string()).optional(),
    subgrupos: z.array(z.string()).optional(),
    limit: z.number().int().optional().describe("Max items per ranking (1-50). Defaults to 10."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (input, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase.rpc("dashboard_rankings", {
      p_date_from: input.dateFrom || (null as unknown as string),
      p_date_to: input.dateTo || (null as unknown as string),
      p_stores: input.stores ?? [],
      p_deptos: input.deptos ?? [],
      p_secoes: input.secoes ?? [],
      p_grupos: input.grupos ?? [],
      p_subgrupos: input.subgrupos ?? [],
      p_limit: Math.min(50, Math.max(1, input.limit ?? 10)),
    });
    if (error) {
      return { content: [{ type: "text", text: error.message }], isError: true };
    }
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? {}) }],
      structuredContent: { rankings: data ?? {} },
    };
  },
});
