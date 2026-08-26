import { createFileRoute } from "@tanstack/react-router";
import { lazy } from "react";

export const Route = createFileRoute("/_authenticated/area_/$analysisId")({
  component: lazy(() => import("./area_.$analysisId.page")),
});
