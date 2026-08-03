import * as Sentry from "@sentry/tanstackstart-react";
import { isRedirect, isNotFound } from "@tanstack/react-router";
import { StartClient } from "@tanstack/react-start/client";
import { StrictMode, startTransition } from "react";
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
  enableLogs: true,
  integrations: [
    Sentry.replayIntegration(),
    Sentry.consoleLoggingIntegration({ levels: ["warn", "error"] }),
  ],
  beforeSend(event, hint) {
    const error = hint.originalException;
    if (isRedirect(error) || isNotFound(error)) return null;
    return event;
  },
});

// startTransition: mesmo padrão do entry client.tsx padrão do TanStack Start
// (node_modules/@tanstack/react-start/dist/plugin/default-entry/client.tsx),
// perdido quando este arquivo virou custom entry pro Sentry.init() acima.
startTransition(() => {
  hydrateRoot(
    document,
    <StrictMode>
      <StartClient />
    </StrictMode>,
    // Sem isto, erro de hidratação (recuperável: React descarta a árvore SSR
    // e renderiza de novo no cliente) só vira um console.error interno do
    // React, capturado pelo consoleLoggingIntegration como log, sem stack
    // trace nem componentStack de verdade. reactErrorHandler() é o helper
    // oficial do SDK pra isso: captura como exceção real, com o componente
    // que causou o mismatch anexado ao evento.
    {
      onCaughtError: Sentry.reactErrorHandler(),
      onUncaughtError: Sentry.reactErrorHandler(),
      onRecoverableError: Sentry.reactErrorHandler(),
    },
  );
});
