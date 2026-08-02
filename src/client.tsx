import * as Sentry from "@sentry/tanstackstart-react";
import { isRedirect, isNotFound } from "@tanstack/react-router";
import { StartClient } from "@tanstack/react-start/client";
import { StrictMode } from "react";
import { hydrateRoot } from "react-dom/client";

const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;

// tunnel aponta pra rota same-origin em src/server.ts (não pro domínio da
// Sentry direto): mantém o CSP com connect-src só 'self' e não é bloqueado
// por ad-blocker.
Sentry.init({
  dsn,
  enabled: !!dsn,
  environment: import.meta.env.PROD ? "production" : "development",
  release: __COMMIT_HASH__,
  tunnel: "/monitoring",
  tracesSampleRate: 1.0,
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 1.0,
  integrations: [Sentry.replayIntegration()],
  beforeSend(event, hint) {
    const error = hint.originalException;
    if (isRedirect(error) || isNotFound(error)) return null;
    return event;
  },
});

hydrateRoot(
  document,
  <StrictMode>
    <StartClient />
  </StrictMode>,
);
