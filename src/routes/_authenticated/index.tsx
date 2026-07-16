import { createFileRoute } from "@tanstack/react-router";
import { lazy } from "react";

export const Route = createFileRoute("/_authenticated/")({
  component: lazy(() => import("./index.page")),
});
