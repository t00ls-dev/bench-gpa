import { QueryClient, QueryCache } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
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
          const { supabase } = await import("@/integrations/supabase/client");
          await supabase.auth.signOut();
          window.location.href = "/auth";
        }
      },
    }),
  });

  const nonce = getCspNonce();
  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
    ...(nonce ? { ssr: { nonce } } : {}),
  });

  return router;
};
