import { createFileRoute } from "@tanstack/react-router";
import { lazy } from "react";

export const Route = createFileRoute("/_authenticated/admin/")({
  component: lazy(() => import("./admin.index.page")),
});
