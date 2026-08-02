import {
  createFileRoute,
  Outlet,
  redirect,
  Link,
  useRouter,
  useLocation,
} from "@tanstack/react-router";
import * as Sentry from "@sentry/tanstackstart-react";
import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import type { FC } from "react";
import {
  LayoutDashboard,
  Upload,
  Package,
  LogOut,
  Layers,
  Shield,
  BookText,
  HelpCircle,
  Loader2,
} from "lucide-react";
import { useNavPendingPath, isNavPendingTo } from "@/hooks/use-nav-pending";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { AppFooter } from "@/components/app-footer";
import { useGotoHotkey, useHotkey } from "@/lib/use-hotkey";
import { useVersionCheck } from "@/hooks/use-version-check";
import { QUERY_STALE_IDENTITY } from "@/lib/query-config";
import { MobileNav } from "@/components/mobile-nav";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  SidebarProvider,
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarGroup,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarFooter,
  SidebarTrigger,
  SidebarInset,
  useSidebar,
} from "@/components/ui/sidebar";

const CommandPalette = lazy(() =>
  import("@/components/command-palette").then((m) => ({ default: m.CommandPalette })),
);
const HelpOverlay = lazy(() =>
  import("@/components/help-overlay").then((m) => ({ default: m.HelpOverlay })),
);

interface UserProfile {
  id: string;
  email: string;
  name: string;
  role: string;
}

export const Route = createFileRoute("/_authenticated")({
  beforeLoad: async ({ context, location }) => {
    try {
      const { getMe } = await import("@/lib/auth-api");
      // Cacheia a identidade por 60s para não bater no servidor (round-trip +
      // SELECT em users) a cada navegação. O admin-gate lê o mesmo cache.
      const user = await context.queryClient.ensureQueryData({
        queryKey: ["me"],
        queryFn: () => getMe(),
        staleTime: QUERY_STALE_IDENTITY,
      });
      if (!user) throw new Error("not authenticated");
      // beforeLoad roda em server (SSR) e client (hidratação/navegação): cobre
      // erro de client daqui pra frente. Erro dentro de server function usa o
      // mesmo Sentry.setUser() em src/lib/auth-middleware.ts (requireAuth),
      // sem depender deste beforeLoad já ter rodado.
      Sentry.setUser({ id: user.id, email: user.email, name: user.name });
      return { user: user as UserProfile };
    } catch {
      const next = location.pathname + location.searchStr;
      throw redirect({
        to: "/auth",
        search: next && next !== "/" ? { next } : { next: undefined },
      });
    }
  },
  component: AuthedLayout,
});

interface NavItem {
  to: string;
  label: string;
  icon: FC<{ className?: string }>;
  exact?: boolean;
}

function NavContent({ nav }: { nav: readonly NavItem[] }) {
  const { setOpenMobile } = useSidebar();
  const loc = useLocation();
  const pendingPath = useNavPendingPath();

  return (
    <SidebarGroup>
      <SidebarMenu>
        {nav.map((n) => {
          const isActive =
            n.to === "/"
              ? loc.pathname === "/"
              : n.exact
                ? loc.pathname === n.to || loc.pathname === n.to + "/"
                : loc.pathname === n.to || loc.pathname.startsWith(n.to + "/");
          const isNavigating = isNavPendingTo(pendingPath, n.to, n.exact);
          return (
            <SidebarMenuItem key={n.to}>
              <SidebarMenuButton asChild isActive={isActive}>
                <Link to={n.to} preload="intent" onClick={() => setOpenMobile(false)}>
                  {isNavigating ? <Loader2 className="animate-spin" /> : <n.icon />}
                  <span>{n.label}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          );
        })}
      </SidebarMenu>
    </SidebarGroup>
  );
}

function AuthedLayout() {
  const router = useRouter();
  const { user, queryClient } = Route.useRouteContext();

  // beforeLoad (acima, no Route config) roda no servidor durante o SSR, mas
  // não necessariamente no client: a hidratação reaproveita o resultado já
  // resolvido em vez de re-executar beforeLoad, então é aqui, no componente
  // que garantidamente monta no navegador, que o Sentry do client fica
  // sabendo quem é o usuário.
  useEffect(() => {
    Sentry.setUser({ id: user.id, email: user.email, name: user.name });
  }, [user.id, user.email, user.name]);

  const signOut = async () => {
    const { logout } = await import("@/lib/auth-api");
    await logout().catch(() => {});
    // Invalida a identidade em cache p/ o guard revalidar no próximo acesso.
    queryClient.removeQueries({ queryKey: ["me"] });
    // Sem isso, um segundo login na mesma aba (troca de conta) herdaria a
    // identidade anterior em qualquer erro de client até o próximo beforeLoad.
    Sentry.setUser(null);
    router.navigate({ to: "/auth", search: { next: undefined }, replace: true });
  };

  useVersionCheck();

  const [helpOpen, setHelpOpen] = useState(false);
  const openHelp = useCallback(() => setHelpOpen(true), []);
  useHotkey("?", openHelp, !helpOpen);

  useGotoHotkey("d", () => router.navigate({ to: "/" }));
  useGotoHotkey("p", () =>
    router.navigate({ to: "/produto", search: { plu: undefined, store: undefined } }),
  );
  useGotoHotkey("a", () =>
    router.navigate({
      to: "/area",
      search: {
        store: undefined,
        depto: undefined,
        secao: undefined,
        grupo: undefined,
        subgrupo: undefined,
      },
    }),
  );
  useGotoHotkey("u", () => router.navigate({ to: "/upload" }));
  useGotoHotkey("o", () => router.navigate({ to: "/admin/docs" }));
  useGotoHotkey("n", () => router.navigate({ to: "/admin" }));
  useGotoHotkey("h", () => router.navigate({ to: "/howto" }));

  const isAdmin = user.role === "admin";

  const commonNav = [
    { to: "/", label: "Dashboard", icon: LayoutDashboard },
    { to: "/produto", label: "Produto", icon: Package },
    { to: "/area", label: "Área", icon: Layers },
    { to: "/howto", label: "Como usar", icon: HelpCircle },
  ] as const;

  const adminNav = [
    { to: "/upload", label: "Importar", icon: Upload },
    { to: "/admin/docs", label: "Documentação", icon: BookText },
    { to: "/admin", label: "Administração", icon: Shield, exact: true },
  ] as const;

  return (
    <>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:p-4 focus:bg-background focus:text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
      >
        Pular para o conteúdo
      </a>
      <SidebarProvider defaultOpen={true}>
        <Sidebar collapsible="offcanvas">
          <SidebarHeader>
            <Link
              to="/"
              className="flex items-center gap-2 px-3 py-2 font-display text-lg font-bold"
            >
              <img src="/brand/gpa-logo-mini.webp" alt="GPA" className="h-9 w-auto" />
            </Link>
          </SidebarHeader>
          <SidebarContent>
            <NavContent nav={commonNav} />
            {isAdmin && (
              <>
                <Separator className="my-2" />
                <NavContent nav={adminNav} />
              </>
            )}
          </SidebarContent>
          <SidebarFooter>
            <div className="flex items-center gap-1 px-3 py-2">
              <span className="flex-1 truncate text-xs text-sidebar-foreground/60">
                {user.email}
              </span>
              <Button
                variant="ghost"
                size="icon"
                onClick={signOut}
                aria-label="Sair"
                className="size-7"
              >
                <LogOut className="size-4" />
              </Button>
            </div>
          </SidebarFooter>
        </Sidebar>
        <SidebarInset>
          <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur">
            <div className="mx-auto flex h-16 max-w-[1400px] items-center gap-4 px-4 md:px-8">
              <Link
                to="/"
                className="flex items-center gap-2 font-display text-lg font-bold md:hidden"
              >
                <img src="/brand/gpa-logo-mini.webp" alt="GPA" className="h-9 w-auto" />
              </Link>
              <SidebarTrigger className="hidden md:flex" />
              <div className="ml-auto flex items-center gap-3">
                <ThemeToggle />
              </div>
            </div>
          </header>
          <main
            id="main-content"
            className="mx-auto w-full max-w-[1400px] px-4 py-6 md:px-8 md:py-10 pb-20 md:pb-10"
          >
            <div className="transition-opacity duration-150">
              <Outlet />
            </div>
            <AppFooter />
          </main>
        </SidebarInset>
        <MobileNav isAdmin={isAdmin} userEmail={user.email} onSignOut={signOut} />
      </SidebarProvider>
      <Suspense fallback={null}>
        <CommandPalette />
        <HelpOverlay open={helpOpen} onClose={() => setHelpOpen(false)} />
      </Suspense>
    </>
  );
}
