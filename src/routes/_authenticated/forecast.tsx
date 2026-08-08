import { createFileRoute } from "@tanstack/react-router";
import { lazy } from "react";

export const Route = createFileRoute("/_authenticated/forecast")({
  validateSearch: (s: Record<string, unknown>) => ({
    store: typeof s.store === "string" ? s.store : undefined,
    targetDate: typeof s.targetDate === "string" ? s.targetDate : undefined,
  }),
  component: lazy(() => import("./forecast.page")),
});
