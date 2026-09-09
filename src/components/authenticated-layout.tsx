import * as Sentry from "@sentry/tanstackstart-react";
import { Link, Outlet, useLocation, useRouteContext, useRouter } from "@tanstack/react-router";
import { useEffect, type FC } from "react";
import {
  BookText,
  ClipboardList,
  HelpCircle,
  KeyRound,
  Layers,
  LayoutDashboard,
  Loader2,
  LogOut,
  Package,
  Shield,
  Upload,
} from "lucide-react";
import { toast } from "sonner";

import { AppFooter } from "@/components/app-footer";
import { MobileNav } from "@/components/mobile-nav";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { useSidebar } from "@/components/ui/sidebar-context";
import { UserIdentifiers } from "@/components/user-identifiers";
import { isNavPendingTo, useNavPendingPath } from "@/hooks/use-nav-pending";
import { useVersionCheck } from "@/hooks/use-version-check";
import { getBrowserSessionStorage, isImportActive } from "@/lib/chunk-reload";
import { hasAdminRole } from "@/lib/roles";

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
        {nav.map((item) => {
          const isActive =
            item.to === "/"
              ? loc.pathname === "/"
              : item.exact
                ? loc.pathname === item.to || loc.pathname === item.to + "/"
                : loc.pathname === item.to || loc.pathname.startsWith(item.to + "/");
          const isNavigating = isNavPendingTo(pendingPath, item.to, item.exact);
          return (
            <SidebarMenuItem key={item.to}>
              <SidebarMenuButton asChild isActive={isActive}>
                <Link to={item.to} preload="intent" onClick={() => setOpenMobile(false)}>
                  {isNavigating ? <Loader2 className="animate-spin" /> : <item.icon />}
                  <span>{item.label}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          );
        })}
      </SidebarMenu>
    </SidebarGroup>
  );
}

export function AuthenticatedLayout() {
  const router = useRouter();
  const { user, queryClient } = useRouteContext({ from: "/_authenticated" });

  // Hydration can reuse the SSR context without rerunning beforeLoad, so this
  // component is where the browser-side Sentry identity is guaranteed.
  useEffect(() => {
    Sentry.setUser({ id: user.id, username: user.username ?? undefined, name: user.name });
  }, [user.id, user.username, user.name]);

  const signOut = async () => {
    if (isImportActive(getBrowserSessionStorage())) {
      toast.error("Cancele a importação em andamento antes de sair da conta.");
      return;
    }
    const { logout } = await import("@/lib/auth-api");
    await logout().catch(() => {});
    // No server-backed cache may survive an account switch in the same tab.
    queryClient.clear();
    Sentry.setUser(null);
    router.navigate({ to: "/auth", search: { next: undefined }, replace: true });
  };

  useVersionCheck();

  const isAdmin = hasAdminRole(user.role);
  const commonNav = [
    { to: "/", label: "Dashboard", icon: LayoutDashboard },
    { to: "/product", label: "Produto", icon: Package },
    { to: "/area", label: "Área", icon: Layers },
    ...(isAdmin
      ? [{ to: "/forecast", label: "Previsão de Venda", icon: ClipboardList } as const]
      : []),
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
