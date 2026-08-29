import { createStart, createMiddleware } from "@tanstack/react-start";
import { sentryGlobalRequestMiddleware } from "@sentry/tanstackstart-react";

import { renderErrorPage } from "./lib/error-page";
import { sentryServerClient } from "./lib/instrument-server";
import { isSentryReported } from "./lib/auth-middleware";
import { isExpectedError } from "./lib/sentry-error-metadata";

const errorMiddleware = createMiddleware().server(async ({ next, request }) => {
  try {
    return await next();
  } catch (error) {
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    console.error(`[${request.url}]`, error);
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

/**
 * @sentry/tanstackstart-react's own sentryGlobalFunctionMiddleware doesn't
 * work here: confirmed (log + beforeSend never called, even waiting well
 * beyond the async transport's timing) that Sentry.captureException()'s
 * ambient lookup finds no client at all inside a TanStack Start server
 * function's execution, with the result that no error from any of the
 * app's 35 server functions ever reached Sentry. An explicit reference to
 * the client (the same lesson from src/lib/auth-middleware.ts and the
 * tunnel in src/server.ts) fixes it.
 */
const sentryFunctionErrorMiddleware = createMiddleware({ type: "function" }).server(
  async ({ next }) => {
    try {
      return await next();
    } catch (error) {
      // requireAuth (src/lib/auth-middleware.ts) already captures with its
      // own Scope (user context) for the common case of an authenticated
      // server function: without this check, the same error gets reported
      // to Sentry twice, here with no context at all. This only captures
      // what hasn't already gone through there (e.g. an error inside a
      // public server function, without requireAuth).
      if (!isSentryReported(error) && !isExpectedError(error)) {
        sentryServerClient?.captureException(error);
      }
      throw error;
    }
  },
);

export const startInstance = createStart(() => ({
  functionMiddleware: [sentryFunctionErrorMiddleware],
  requestMiddleware: [sentryGlobalRequestMiddleware, errorMiddleware],
}));
