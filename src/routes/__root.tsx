import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useCallback, useState, type ReactNode } from "react";
import { Toaster } from "sonner";

import appCss from "../styles.css?url";
import { CommandPalette } from "@/components/command-palette";
import { HelpOverlay } from "@/components/help-overlay";
import { RouteProgress } from "@/components/route-progress";
import { useHotkey } from "@/lib/use-hotkey";

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
    console.error("Root error boundary caught:", error);
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
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Bench GPA" },
      {
        name: "description",
        content: "Plataforma de análise operacional e comercial do Grupo Pão de Açúcar.",
      },
      { property: "og:title", content: "Bench GPA" },
      { name: "twitter:title", content: "Bench GPA" },
      {
        property: "og:description",
        content: "Plataforma de análise operacional e comercial do Grupo Pão de Açúcar.",
      },
      {
        name: "twitter:description",
        content: "Plataforma de análise operacional e comercial do Grupo Pão de Açúcar.",
      },
    ],
    links: [
      { rel: "icon", type: "image/x-icon", href: "/favicon.ico" },
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
  const [helpOpen, setHelpOpen] = useState(false);
  const openHelp = useCallback(() => setHelpOpen(true), []);
  useHotkey("?", openHelp, !helpOpen);
  return (
    <QueryClientProvider client={queryClient}>
      <RouteProgress />
      <Outlet />
      <Toaster richColors position="top-right" />
      <CommandPalette />
      <HelpOverlay open={helpOpen} onClose={() => setHelpOpen(false)} />
    </QueryClientProvider>
  );
}
