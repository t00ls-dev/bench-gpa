import { createFileRoute, redirect } from "@tanstack/react-router";
import { lazy } from "react";
import { hasAdminRole } from "@/lib/roles";

export const Route = createFileRoute("/_authenticated/forecast")({
  beforeLoad: async ({ context }) => {
    const user = context.user;
    if (!user) throw redirect({ to: "/auth", search: { next: undefined } });
    if (!hasAdminRole(user.role)) throw redirect({ to: "/" });
  },
  validateSearch: (s: Record<string, unknown>) => ({
    store: typeof s.store === "string" ? s.store : undefined,
    targetDate: typeof s.targetDate === "string" ? s.targetDate : undefined,
  }),
  component: lazy(() => import("./forecast.page")),
});
