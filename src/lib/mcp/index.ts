import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listStores from "./tools/list-stores";
import listImportedDates from "./tools/list-imported-dates";
import searchProducts from "./tools/search-products";
import getProductAnalysis from "./tools/get-product-analysis";
import getDashboardMetrics from "./tools/get-dashboard-metrics";
import getDashboardRankings from "./tools/get-dashboard-rankings";
import getAreaAnalysis from "./tools/get-area-analysis";

const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "bench-gpa-mcp",
  title: "Bench GPA",
  version: "0.1.0",
  instructions:
    "Tools to query Bench GPA (GPA operational and commercial analytics): stores, imported sale dates, product search, product analysis, dashboard metrics and rankings, and area analysis. All queries respect the signed-in user's permissions.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [
    listStores,
    listImportedDates,
    searchProducts,
    getProductAnalysis,
    getDashboardMetrics,
    getDashboardRankings,
    getAreaAnalysis,
  ],
});
