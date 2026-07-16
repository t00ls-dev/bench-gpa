import { createFileRoute } from "@tanstack/react-router";
import { lazy } from "react";

const AdminPage = lazy(() => import("./admin.index.page"));

export const Route = createFileRoute("/_authenticated/admin/")({
  component: AdminPage,
});
