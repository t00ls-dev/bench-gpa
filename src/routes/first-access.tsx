import { createFileRoute, redirect } from "@tanstack/react-router";
import { lazy } from "react";

export const Route = createFileRoute("/first-access")({
  ssr: false,
  head: () => ({
    links: [{ rel: "preconnect", href: "https://challenges.cloudflare.com" }],
  }),
  beforeLoad: async () => {
    try {
      const { getMe } = await import("@/lib/auth-api");
      const user = await getMe();
      if (user) throw redirect({ to: "/" });
    } catch {
      // not logged in, show the page
    }
  },
  component: lazy(() => import("./first-access.page")),
});
