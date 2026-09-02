import { createFileRoute, redirect } from "@tanstack/react-router";
import { lazy } from "react";
import { hasAdminRole } from "@/lib/roles";

export const Route = createFileRoute("/_authenticated/upload")({
  beforeLoad: async ({ context }) => {
    const u = context.user;
    if (!u) throw redirect({ to: "/auth", search: { next: undefined } });
    if (!hasAdminRole(u.role)) throw redirect({ to: "/" });
  },
  component: lazy(() => import("./upload.page")),
});
