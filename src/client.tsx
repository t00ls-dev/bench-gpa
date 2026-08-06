import * as Sentry from "@sentry/tanstackstart-react";
import { isRedirect, isNotFound } from "@tanstack/react-router";
import { StartClient } from "@tanstack/react-start/client";
import { StrictMode, startTransition } from "react";
import { hydrateRoot } from "react-dom/client";

const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;

// tunnel points to the same-origin route in src/server.ts (not directly to
// Sentry's domain): keeps the CSP's connect-src at just 'self' and isn't
// blocked by ad blockers.
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

const CHUNK_RELOAD_KEY = "bench-gpa:chunk-reload-attempted";

// Vite fires this event (cancelable, node_modules/vite/.../handlePreloadError)
// before letting a failed dynamic import() blow up - a chunk removed by a
// mid-session deploy, or an unstable network mid-load (common on mobile:
// BENCH-GPA-Q). preventDefault() takes over recovery instead of letting it
// become an unhandled exception: reports to Sentry first (otherwise the
// capture is lost, since it no longer reaches onUncaughtError) and reloads
// once. sessionStorage avoids a loop if the reload fails for the same
// reason (e.g. the user is genuinely offline) - the second failure in the
// same tab falls through to the normal error screen instead of reloading
// again. Skipped on /upload for the same reason as useVersionCheck: a
// multi-step flow can't be interrupted by a reload.
window.addEventListener("vite:preloadError", (event) => {
  Sentry.captureException((event as Event & { payload?: unknown }).payload ?? event);
  event.preventDefault();

  if (window.location.pathname.startsWith("/upload")) return;
  if (sessionStorage.getItem(CHUNK_RELOAD_KEY)) return;

  sessionStorage.setItem(CHUNK_RELOAD_KEY, "1");
  window.location.reload();
});

// startTransition: same pattern as TanStack Start's default client.tsx entry
// (node_modules/@tanstack/react-start/dist/plugin/default-entry/client.tsx),
// lost when this file became a custom entry for Sentry.init() above.
startTransition(() => {
  hydrateRoot(
    document,
    <StrictMode>
      <StartClient />
    </StrictMode>,
    // Without this, a hydration error (recoverable: React discards the SSR
    // tree and renders again on the client) only becomes an internal React
    // console.error, captured by consoleLoggingIntegration as a log, with
    // no real stack trace or componentStack. reactErrorHandler() is the
    // SDK's official helper for this: captures it as a real exception, with
    // the component that caused the mismatch attached to the event.
    {
      onCaughtError: Sentry.reactErrorHandler(),
      onUncaughtError: Sentry.reactErrorHandler(),
      onRecoverableError: Sentry.reactErrorHandler(),
    },
  );
});
