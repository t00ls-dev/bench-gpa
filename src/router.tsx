import { QueryClient, QueryCache } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import * as Sentry from "@sentry/tanstackstart-react";
import { toast } from "sonner";
import { routeTree } from "./routeTree.gen";
import { getCspNonce } from "./lib/csp";

export const getRouter = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60_000,
        gcTime: 10 * 60_000,
        refetchOnWindowFocus: false,
        retry: 1,
      },
    },
    queryCache: new QueryCache({
      onError: async (error) => {
        const msg = error?.message ?? "";
        // The session is still valid here (unlike the "Unauthorized" branch
        // below): the password just needs to be set/updated before
        // continuing, so it does NOT log out -- it only redirects to the
        // change-password screen.
        if (msg.includes("PasswordChangeRequired")) {
          const path = window.location.pathname + window.location.search;
          const next = path && path !== "/" ? `?next=${encodeURIComponent(path)}` : "";
          window.location.href = `/change-password${next}`;
          return;
        }
        if (
          msg.includes("Unauthorized") ||
          msg.includes("Invalid token") ||
          msg.includes("forbidden")
        ) {
          toast.error("Sessão expirada. Faça login novamente.");
          const { logout } = await import("./lib/auth-api");
          await logout().catch(() => {});
          const path = window.location.pathname + window.location.search;
          const next = path && path !== "/" ? `?next=${encodeURIComponent(path)}` : "";
          window.location.href = `/auth${next}`;
        }
      },
    }),
  });

  const nonce = getCspNonce();
  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPendingMs: 0,
    defaultPreloadStaleTime: 0,
    ...(nonce ? { ssr: { nonce } } : {}),
  });

  // getRouter runs both on the server (SSR) and on the client (hydration):
  // on the server, @sentry/tanstackstart-react deliberately resolves
  // tanstackRouterBrowserTracingIntegration to a no-op stub (avoids a build
  // error from trying to use a browser API), so no environment guard is
  // needed here. Sentry.init() already ran before this (in src/client.tsx /
  // src/lib/instrument-server.ts), and the router only exists once it's
  // created here, which is why addIntegration() is used instead of passing
  // it in init's `integrations` array.
  Sentry.addIntegration(Sentry.tanstackRouterBrowserTracingIntegration(router));

  return router;
};
