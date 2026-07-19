import { createFileRoute, redirect } from "@tanstack/react-router";
import { lazy } from "react";

export const Route = createFileRoute("/_authenticated/upload")({
  beforeLoad: async ({ context }) => {
    const u = context.user;
    if (!u) throw redirect({ to: "/auth", search: { next: undefined } });
    if (u.role !== "admin") throw redirect({ to: "/" });
  },
  component: lazy(() => import("./upload.page")),
});
