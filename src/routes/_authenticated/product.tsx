import { createFileRoute } from "@tanstack/react-router";
import { lazy } from "react";

export const Route = createFileRoute("/_authenticated/product")({
  validateSearch: (s: Record<string, unknown>) => ({
    plu: typeof s.plu === "string" ? s.plu : undefined,
    store: typeof s.store === "string" ? s.store : undefined,
  }),
  component: lazy(() => import("./product.page")),
});
