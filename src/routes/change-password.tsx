import { createFileRoute, redirect } from "@tanstack/react-router";
import { lazy } from "react";

export const Route = createFileRoute("/change-password")({
  ssr: false,
  validateSearch: (s: Record<string, unknown>) => ({
    next: typeof s.next === "string" ? s.next : undefined,
  }),
  // Rota fora de _authenticated/ de propósito: um usuário com
  // passwordChangeRequired ainda não pode navegar pra lugar nenhum do layout
  // autenticado (o próprio requireAuth bloqueia toda server function até a
  // senha ser trocada), então herdar aquele beforeLoad formaria um loop de
  // redirect. Aqui só se exige uma sessão válida (getMe não nulo).
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
