import { createStart, createMiddleware } from "@tanstack/react-start";
import { sentryGlobalRequestMiddleware } from "@sentry/tanstackstart-react";

import { renderErrorPage } from "./lib/error-page";
import { sentryServerClient } from "./lib/instrument-server";

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
 * Sentry.tanstackstart-react's próprio sentryGlobalFunctionMiddleware não
 * funciona aqui: confirmado (log + beforeSend nunca chamado, mesmo
 * esperando de sobra pro transporte assíncrono) que Sentry.captureException()
 * ambiente não acha client nenhum dentro da execução de server function do
 * TanStack Start, resultado, nenhum erro de dentro de nenhuma das 35 server
 * functions do app chegava no Sentry. Referência explícita ao client (mesma
 * lição de src/lib/auth-middleware.ts e do tunnel em src/server.ts) resolve.
 */
const sentryFunctionErrorMiddleware = createMiddleware({ type: "function" }).server(
  async ({ next }) => {
    try {
      return await next();
    } catch (error) {
      sentryServerClient?.captureException(error);
      throw error;
    }
  },
);

export const startInstance = createStart(() => ({
  functionMiddleware: [sentryFunctionErrorMiddleware],
  requestMiddleware: [sentryGlobalRequestMiddleware, errorMiddleware],
}));
