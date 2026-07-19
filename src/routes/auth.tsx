import { createFileRoute, redirect } from "@tanstack/react-router";
import { lazy } from "react";

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
    try {
      const { getMe } = await import("@/lib/auth-api");
      const user = await getMe();
      if (user) {
        const target = sanitizeNext(search.next);
        if (target !== "/") {
          const u = new URL(target, window.location.origin);
          throw redirect({ to: u.pathname, search: Object.fromEntries(u.searchParams.entries()) });
        }
        throw redirect({ to: "/" });
      }
    } catch {
      // not logged in, show auth page
    }
  },
  component: lazy(() => import("./auth.page")),
});
