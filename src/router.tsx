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

  // getRouter roda tanto no server (SSR) quanto no client (hidratação): no
  // server, @sentry/tanstackstart-react resolve tanstackRouterBrowserTracingIntegration
  // pra um stub no-op de propósito (evita erro de build tentando usar API de
  // browser), então não precisa de guard de ambiente aqui. Sentry.init() já
  // rodou antes disso (em src/client.tsx / src/lib/instrument-server.ts), e o
  // router só existe depois de criado aqui, por isso addIntegration() em vez
  // de passar no array `integrations` do init.
  Sentry.addIntegration(Sentry.tanstackRouterBrowserTracingIntegration(router));

  return router;
};
