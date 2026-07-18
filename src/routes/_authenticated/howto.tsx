import { createFileRoute } from "@tanstack/react-router";
import { lazy } from "react";

export const Route = createFileRoute("/_authenticated/howto")({
  component: lazy(() => import("./howto.page")),
});
