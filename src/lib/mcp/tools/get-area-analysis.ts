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
  name: "get_area_analysis",
  title: "Get area analysis",
  description:
    "Get area analysis for a period: PLU counts (total, with/without sale), average per PLU, per-product breakdown (value, quantity, last sale date), and sales by date.",
  inputSchema: {
    dateFrom: z.string().describe("Start date YYYY-MM-DD."),
    dateTo: z.string().describe("End date YYYY-MM-DD."),
    stores: z.array(z.string()).optional(),
    deptos: z.array(z.string()).optional(),
    secoes: z.array(z.string()).optional(),
    grupos: z.array(z.string()).optional(),
    subgrupos: z.array(z.string()).optional(),
    prodCodes: z.array(z.string()).optional().describe("Restrict to specific product codes."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (input, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase.rpc("area_analysis", {
      p_date_from: input.dateFrom,
      p_date_to: input.dateTo,
      p_stores: input.stores ?? [],
      p_deptos: input.deptos ?? [],
      p_secoes: input.secoes ?? [],
      p_grupos: input.grupos ?? [],
      p_subgrupos: input.subgrupos ?? [],
      p_prod_codes: input.prodCodes ?? [],
    });
    if (error) {
      return { content: [{ type: "text", text: error.message }], isError: true };
    }
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? {}) }],
      structuredContent: { area: data ?? {} },
    };
  },
});
