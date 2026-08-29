import * as Sentry from "@sentry/tanstackstart-react";
import { isRedirect, isNotFound } from "@tanstack/react-router";
import { StartClient } from "@tanstack/react-start/client";
import { StrictMode, startTransition } from "react";
import { hydrateRoot } from "react-dom/client";
import {
  claimChunkReload,
  clearImportActive,
  consumeChunkReloadPending,
  getBrowserSessionStorage,
  isImportActive,
  markChunkReloadPending,
} from "@/lib/chunk-reload";

const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
const reloadStorage = getBrowserSessionStorage();

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
    if (consumeChunkReloadPending(error)) return null;
    if (isRedirect(error) || isNotFound(error)) return null;
    return event;
  },
});

// An import cannot survive a page lifetime. Clear state left by a discarded
// tab before preload and version recovery can consult it.
clearImportActive(reloadStorage);

// Vite fires this event (cancelable, node_modules/vite/.../handlePreloadError)
// before letting a failed dynamic import() blow up - a chunk removed by a
// mid-session deploy, or an unstable network mid-load (common on mobile:
// BENCH-GPA-Q). The event must not be canceled: Vite treats a canceled error
// as a successful import with an undefined module, which then causes a second
// misleading error in TanStack Router (BENCH-GPA-18). Letting the original
// failure propagate preserves its real stack while the reload recovers the
// page. The release-scoped marker prevents a persistent failure from looping,
// but still allows a long-lived tab to recover after future deploys. Only the
// first failure that triggers recovery is suppressed in Sentry; a repeated
// failure in the same release propagates normally and remains observable.
window.addEventListener("vite:preloadError", (event) => {
  if (isImportActive(reloadStorage)) return;
  if (!claimChunkReload(reloadStorage, __COMMIT_HASH__)) return;
  markChunkReloadPending((event as Event & { payload?: unknown }).payload);
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
