import * as Sentry from "@sentry/tanstackstart-react";
import { createFileRoute, isRedirect, redirect } from "@tanstack/react-router";

import { AuthenticatedLayout } from "@/components/authenticated-layout";
import { QUERY_STALE_IDENTITY } from "@/lib/query-config";

interface UserProfile {
  id: string;
  username: string | null;
  employeeId: string | null;
  name: string;
  role: string;
}

export const Route = createFileRoute("/_authenticated")({
  beforeLoad: async ({ context, location }) => {
    try {
      const { getMe } = await import("@/lib/auth-api");
      // Caches the identity for 60s to avoid hitting the server (round-trip
      // + SELECT on users) on every navigation. admin-gate reads the same cache.
      const user = await context.queryClient.ensureQueryData({
        queryKey: ["me"],
        queryFn: () => getMe(),
        staleTime: QUERY_STALE_IDENTITY,
      });
      if (!user) throw new Error("not authenticated");
      // Password not set yet (first access/admin reset) or expired (30
      // days): blocks the entire authenticated layout until resolved.
      // requireAuth already blocks server functions the same way, this
      // redirect is just the client-side half, so navigation doesn't
      // render screens that would fail on every call.
      if (user.passwordChangeRequired) {
        const next = location.pathname + location.searchStr;
        throw redirect({
          to: "/change-password",
          search: next && next !== "/" ? { next } : { next: undefined },
        });
      }
      // beforeLoad runs on the server (SSR) and client (hydration/navigation):
      // covers client errors from here on. An error inside a server function
      // uses the same Sentry.setUser() in src/lib/auth-middleware.ts
      // (requireAuth), without depending on this beforeLoad having run already.
      Sentry.setUser({ id: user.id, username: user.username ?? undefined, name: user.name });
      return { user: user as UserProfile };
    } catch (error) {
      // Redirect already resolved above (passwordChangeRequired): rethrow it
      // directly, otherwise it would turn into "not authenticated" and send
      // to the wrong /auth.
      if (isRedirect(error)) throw error;
      const next = location.pathname + location.searchStr;
      throw redirect({
        to: "/auth",
        search: next && next !== "/" ? { next } : { next: undefined },
      });
    }
  },
  component: AuthenticatedLayout,
});
