import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import * as Sentry from "@sentry/tanstackstart-react";
import { useState, type ReactNode } from "react";
import { Toaster } from "sonner";

import appCss from "../styles.css?url";
import { RouteProgress } from "@/components/route-progress";
import {
  claimChunkReload,
  getBrowserSessionStorage,
  handlePendingChunkReload,
  isChunkLoadError,
  isImportActive,
} from "@/lib/chunk-reload";

function NotFoundComponent() {
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

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
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
    // TanStack Router's route error boundary: intercepts before the error
    // reaches React's onCaughtError/onUncaughtError (hydrateRoot, in
    // client.tsx), so it needs its own report, this isn't redundant.
    console.error("Root error boundary caught:", error);
    Sentry.captureException(error);
  });
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold">Algo deu errado</h1>
        <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
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

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  // Internal app, behind authentication: there's no external audience to
  // attract, so indexing and social-preview metadata are an anti-feature
  // here. `description`, `og:title`, `og:description`, `twitter:title`, and
  // `twitter:description` were removed from here: don't reintroduce them.
  // `public/robots.txt` deliberately keeps `Disallow: /`: it blocks
  // indexing, which is what we want.
  //
  // What remains is functional: charset, viewport, and the tab title.
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { name: "theme-color", content: "#00724c" },
      { title: "Bench GPA" },
    ],
    links: [
      // `?v=` ties the URL to the build's commit: every deploy becomes a new
      // URL, which invalidates browser and CDN (Cloudflare) cache without
      // needing a manual purge. The icons referenced from inside
      // manifest.json get the same treatment during the prebuild
      // (scripts/prebuild-version-manifest.mjs).
      { rel: "icon", type: "image/x-icon", href: `/favicon.ico?v=${__COMMIT_HASH__}` },
      // Explicit PNG alongside the .ico: modern browsers prefer PNG when
      // available, and this file has confirmed transparency (same mark as
      // the favicon, exported directly as PNG without an ICO container).
      {
        rel: "icon",
        type: "image/png",
        sizes: "192x192",
        href: `/icons/icon-192.png?v=${__COMMIT_HASH__}`,
      },
      { rel: "apple-touch-icon", href: `/apple-touch-icon.png?v=${__COMMIT_HASH__}` },
      { rel: "manifest", href: `/manifest.json?v=${__COMMIT_HASH__}` },
      { rel: "stylesheet", href: appCss },
    ],
  }),
  validateSearch: (s: Record<string, unknown>) => s,
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
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

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  return (
    <QueryClientProvider client={queryClient}>
      <RouteProgress />
      <Outlet />
      <Toaster richColors position="top-right" />
    </QueryClientProvider>
  );
}
