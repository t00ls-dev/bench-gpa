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
  name: "get_product_analysis",
  title: "Get product analysis",
  description:
    "Get detailed sales analysis for a single product: sales by store, evolution over time, and last four same-weekday and consecutive-day comparisons.",
  inputSchema: {
    prodCode: z.string().describe("Product PLU / code."),
    storeCode: z.string().optional().describe("Optional store code to scope the analysis."),
    referenceDate: z
      .string()
      .optional()
      .describe("Optional reference date (YYYY-MM-DD). Defaults to the latest imported date."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ prodCode, storeCode, referenceDate }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase.rpc("product_analysis", {
      p_prod_code: prodCode,
      p_store_code: storeCode || undefined,
      p_ref_date: referenceDate || undefined,
    });
    if (error) {
      return { content: [{ type: "text", text: error.message }], isError: true };
    }
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? {}) }],
      structuredContent: { analysis: data ?? {} },
    };
  },
});
