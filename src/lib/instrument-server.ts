// Must be the first import in src/server.ts: modules imported after it
// (error-capture, csp, etc.) only get evaluated once this file has run, so
// this is the one place that can guarantee the SDK is initialized before
// any other server code.
import * as Sentry from "@sentry/tanstackstart-react";
import { isRedirect, isNotFound } from "@tanstack/react-router";

// Direct reference to the client, not the ambient lookup
// (Sentry.getClient()): inside a TanStack Start server function's
// execution, the context propagation the SDK uses to find the "current"
// client/scope doesn't work (and it's not just the tunnel: confirmed that
// even a direct captureException() finds no client here, even when called
// within the same request). server.ts already learned this lesson for the
// tunnel (explicit allowedDsns instead of getClient()); this is the version
// for inside server functions.
export const sentryServerClient = Sentry.init({
  dsn: process.env.SENTRY_DSN,
  enabled: !!process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV === "production" ? "production" : "development",
  release: __COMMIT_HASH__,
  tracesSampleRate: 1.0,
  enableLogs: true,
  // Replaces sendDefaultPii (deprecated): only enables URL query strings
  // and SQL query parameters/values (internal business data, no consumer
  // PII). Everything else explicitly turned off, including options that
  // would default to true here: the session cookie is the httpOnly JWT,
  // the request body includes the plaintext password in the /auth POST,
  // and a local variable in a stack trace could capture a credential that
  // happened to be in memory at crash time.
  dataCollection: {
    userInfo: false,
    cookies: false,
    httpHeaders: { request: false, response: false },
    httpBodies: [],
    urlQueryParams: true,
    databaseQueryData: true,
    stackFrameVariables: false,
  },
  // Levels match what the code already uses (only console.warn/console.error
  // today, no console.log): no call site needs to change for these logs to
  // show up correlated with errors/traces in Sentry.
  integrations: [Sentry.consoleLoggingIntegration({ levels: ["warn", "error"] })],
  // TanStack Router's redirect()/notFound() propagate as a throw (see
  // errorMiddleware in src/start.ts, which deliberately lets them through)
  // and aren't errors at all, they're normal navigation: without this
  // filter, every authenticated route change or 404 turns into an "error"
  // in Sentry.
  beforeSend(event, hint) {
    const error = hint.originalException;
    if (isRedirect(error) || isNotFound(error)) return null;
    return event;
  },
});
