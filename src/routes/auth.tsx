import { createFileRoute, redirect } from "@tanstack/react-router";
import { lazy } from "react";
import { supabase } from "@/integrations/supabase/client";

function sanitizeNext(next: unknown): string {
  if (typeof next !== "string") return "/";
  if (!next.startsWith("/") || next.startsWith("//")) return "/";
  return next;
}

export const Route = createFileRoute("/auth")({
  ssr: false,
  validateSearch: (s: Record<string, unknown>) => ({
    next: typeof s.next === "string" ? s.next : undefined,
  }),
  beforeLoad: async ({ search }) => {
    const { data } = await supabase.auth.getUser();
    if (data.user) {
      const target = sanitizeNext(search.next);
      if (target !== "/") {
        const u = new URL(target, window.location.origin);
        throw redirect({ to: u.pathname, search: Object.fromEntries(u.searchParams.entries()) });
      }
      throw redirect({ to: "/" });
    }
  },
  component: lazy(() => import("./auth.page")),
});
