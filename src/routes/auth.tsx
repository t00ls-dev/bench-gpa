import { createFileRoute, redirect } from "@tanstack/react-router";
import { lazy } from "react";
import { sanitizeNext } from "@/lib/sanitize-next";

export const Route = createFileRoute("/auth")({
  ssr: false,
  head: () => ({
    links: [{ rel: "preconnect", href: "https://challenges.cloudflare.com" }],
  }),
  validateSearch: (s: Record<string, unknown>) => ({
    next: typeof s.next === "string" ? s.next : undefined,
  }),
  beforeLoad: async ({ search }) => {
    try {
      const { getMe } = await import("@/lib/auth-api");
      const user = await getMe();
      if (user) {
        const target = sanitizeNext(search.next, window.location.origin);
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
