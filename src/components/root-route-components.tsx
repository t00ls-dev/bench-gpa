import { QueryClientProvider } from "@tanstack/react-query";
import {
  HeadContent,
  Link,
  Outlet,
  Scripts,
  useRouteContext,
  useRouter,
} from "@tanstack/react-router";
import * as Sentry from "@sentry/tanstackstart-react";
import { useState, type ReactNode } from "react";
import { Toaster } from "sonner";

import { RouteProgress } from "@/components/route-progress";
import {
  claimChunkReload,
  getBrowserSessionStorage,
  handlePendingChunkReload,
  isChunkLoadError,
  isImportActive,
} from "@/lib/chunk-reload";

export function RootNotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <p className="mt-4 text-muted-foreground">Página não encontrada.</p>
        <Link
          to="/"
          className="mt-6 inline-flex rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          Voltar
        </Link>
      </div>
    </div>
  );
}

export function RootError({ error, reset }: { error: unknown; reset: () => void }) {
  const router = useRouter();
  const message = error instanceof Error ? error.message : "Ocorreu um erro inesperado.";
  useState(() => {
    if (
      typeof window !== "undefined" &&
      isChunkLoadError(error) &&
      !isImportActive(getBrowserSessionStorage())
    ) {
      if (claimChunkReload(getBrowserSessionStorage(), __COMMIT_HASH__)) {
        window.location.reload();
        return;
      }
      if (handlePendingChunkReload(error)) return;
    }
    // TanStack Router's route error boundary intercepts before the error
    // reaches React's onCaughtError/onUncaughtError in client.tsx, so it
    // needs its own report.
    console.error("Root error boundary caught:", error);
    Sentry.captureException(error);
  });
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold">Algo deu errado</h1>
        <p className="mt-2 text-sm text-muted-foreground">{message}</p>
        <button
          onClick={() => {
            router.invalidate();
            reset();
          }}
          className="mt-6 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          Tentar novamente
        </button>
      </div>
    </div>
  );
}

export function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

export function RootComponent() {
  const { queryClient } = useRouteContext({ from: "__root__" });
  return (
    <QueryClientProvider client={queryClient}>
      <RouteProgress />
      <Outlet />
      <Toaster richColors position="top-right" />
    </QueryClientProvider>
  );
}
