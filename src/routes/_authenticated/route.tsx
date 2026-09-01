import {
  createFileRoute,
  Outlet,
  redirect,
  isRedirect,
  Link,
  useRouter,
  useLocation,
} from "@tanstack/react-router";
import * as Sentry from "@sentry/tanstackstart-react";
import { useEffect } from "react";
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
  KeyRound,
  ClipboardList,
} from "lucide-react";
import { useNavPendingPath, isNavPendingTo } from "@/hooks/use-nav-pending";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { AppFooter } from "@/components/app-footer";
import { useVersionCheck } from "@/hooks/use-version-check";
import { QUERY_STALE_IDENTITY } from "@/lib/query-config";
import { MobileNav } from "@/components/mobile-nav";
import { UserIdentifiers } from "@/components/user-identifiers";
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

interface UserProfile {
  id: string;
  username: string | null;
  employeeId: string | null;
  name: string;
  role: string;
}

export const Route = createFileRoute("/_authenticated")({
  beforeLoad: async ({ context, location }) => {
    try {
      const { getMe } = await import("@/lib/auth-api");
      // Caches the identity for 60s to avoid hitting the server (round-trip
      // + SELECT on users) on every navigation. admin-gate reads the same cache.
      const user = await context.queryClient.ensureQueryData({
        queryKey: ["me"],
        queryFn: () => getMe(),
        staleTime: QUERY_STALE_IDENTITY,
      });
      if (!user) throw new Error("not authenticated");
      // Password not set yet (first access/admin reset) or expired (30
      // days): blocks the entire authenticated layout until resolved.
      // requireAuth already blocks server functions the same way -- this
      // redirect is just the client-side half, so navigation doesn't
      // render screens that would fail on every call.
      if (user.passwordChangeRequired) {
        const next = location.pathname + location.searchStr;
        throw redirect({
          to: "/change-password",
          search: next && next !== "/" ? { next } : { next: undefined },
        });
      }
      // beforeLoad runs on the server (SSR) and client (hydration/navigation):
      // covers client errors from here on. An error inside a server function
      // uses the same Sentry.setUser() in src/lib/auth-middleware.ts
      // (requireAuth), without depending on this beforeLoad having run already.
      Sentry.setUser({ id: user.id, username: user.username ?? undefined, name: user.name });
      return { user: user as UserProfile };
    } catch (err) {
      // Redirect already resolved above (passwordChangeRequired): rethrow it
      // directly, otherwise it would turn into "not authenticated" and send
      // to the wrong /auth.
      if (isRedirect(err)) throw err;
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

  // beforeLoad (above, in the Route config) runs on the server during SSR,
  // but not necessarily on the client: hydration reuses the already-resolved
  // result instead of re-running beforeLoad, so this is the place -- the
  // component that's guaranteed to mount in the browser -- where the
  // client's Sentry finds out who the user is.
  useEffect(() => {
    Sentry.setUser({ id: user.id, username: user.username ?? undefined, name: user.name });
  }, [user.id, user.username, user.name]);

  const signOut = async () => {
    const { logout } = await import("@/lib/auth-api");
    await logout().catch(() => {});
    // No server-backed cache may survive an account switch in the same tab.
    queryClient.clear();
    Sentry.setUser(null);
    router.navigate({ to: "/auth", search: { next: undefined }, replace: true });
  };

  useVersionCheck();

  const isAdmin = user.role === "admin";

  const commonNav = [
    { to: "/", label: "Dashboard", icon: LayoutDashboard },
    { to: "/product", label: "Produto", icon: Package },
    { to: "/area", label: "Área", icon: Layers },
    { to: "/forecast", label: "Previsão de Venda", icon: ClipboardList },
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
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs text-sidebar-foreground/80">{user.name}</div>
                <UserIdentifiers
                  username={user.username}
                  employeeId={user.employeeId}
                  className="mt-0.5 text-[10px] leading-tight text-sidebar-foreground/50"
                />
              </div>
              <Button
                variant="ghost"
                size="icon"
                asChild
                aria-label="Trocar senha"
                className="size-7"
              >
                <Link to="/change-password" search={{ next: undefined }}>
                  <KeyRound className="size-4" />
                </Link>
              </Button>
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
        <MobileNav
          isAdmin={isAdmin}
          name={user.name}
          username={user.username}
          employeeId={user.employeeId}
          onSignOut={signOut}
        />
      </SidebarProvider>
    </>
  );
}
