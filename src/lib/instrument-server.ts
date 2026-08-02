// Precisa ser o primeiro import de src/server.ts: módulos importados depois
// dele (error-capture, csp, etc.) só são avaliados após este arquivo rodar,
// então é aqui (e só aqui) que dá pra garantir o SDK inicializado antes de
// qualquer outro código do servidor.
import * as Sentry from "@sentry/tanstackstart-react";
import { isRedirect, isNotFound } from "@tanstack/react-router";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  enabled: !!process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV === "production" ? "production" : "development",
  release: __COMMIT_HASH__,
  tracesSampleRate: 1.0,
  // redirect()/notFound() do TanStack Router se propagam como throw (ver
  // errorMiddleware em src/start.ts, que os deixa passar de propósito) e não
  // são erro nenhum, são navegação normal: sem este filtro, toda troca de
  // rota autenticada ou 404 vira "erro" no Sentry.
  beforeSend(event, hint) {
    const error = hint.originalException;
    if (isRedirect(error) || isNotFound(error)) return null;
    return event;
  },
});
