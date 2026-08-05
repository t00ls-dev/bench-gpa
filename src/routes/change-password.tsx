import { createFileRoute, redirect } from "@tanstack/react-router";
import { lazy } from "react";

export const Route = createFileRoute("/change-password")({
  ssr: false,
  validateSearch: (s: Record<string, unknown>) => ({
    next: typeof s.next === "string" ? s.next : undefined,
  }),
  // Route deliberately outside _authenticated/: a user with
  // passwordChangeRequired still can't navigate anywhere in the authenticated
  // layout (requireAuth itself blocks every server function until the
  // password is changed), so inheriting that beforeLoad would form a
  // redirect loop. Here only a valid session is required (getMe not null).
  beforeLoad: async () => {
    try {
      const { getMe } = await import("@/lib/auth-api");
      const user = await getMe();
      if (!user) throw new Error("not authenticated");
      return { passwordChangeRequired: user.passwordChangeRequired };
    } catch {
      throw redirect({ to: "/auth", search: { next: undefined } });
    }
  },
  component: lazy(() => import("./change-password.page")),
});
