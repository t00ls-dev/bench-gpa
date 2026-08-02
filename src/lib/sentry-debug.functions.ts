import { createServerFn } from "@tanstack/react-start";
import { requireAuth } from "./auth-middleware";
import { assertAdmin } from "./admin-utils";

/**
 * TEMPORÁRIO: server function de teste pra validar a captura de erro do
 * Sentry (corrigida no PR #154) em produção de verdade. Remover depois da
 * verificação, junto com o botão em admin.index.page.tsx que a chama.
 */
export const sentryDebugThrow = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    console.error("[sentry-debug] teste de log estruturado");
    throw new Error("Sentry debug: erro forçado de dentro de server function");
  });
