import {
  createFileRoute,
  Outlet,
  redirect,
  Link,
  useRouter,
  useLocation,
} from "@tanstack/react-router";
import { useEffect, useState } from "react";
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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { AppFooter } from "@/components/app-footer";
import { Skeleton } from "@/components/ui/skeleton";
import { useGotoHotkey } from "@/lib/use-hotkey";
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

interface UserProfile {
  id: string;
  email: string;
  name: string;
  role: string;
}

export const Route = createFileRoute("/_authenticated")({
  beforeLoad: async ({ location }) => {
    try {
      const { getMe } = await import("@/lib/auth-api");
      const user = await getMe();
      if (!user) throw new Error("not authenticated");
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
          return (
            <SidebarMenuItem key={n.to}>
              <SidebarMenuButton asChild isActive={isActive}>
                <Link to={n.to} preload="intent" onClick={() => setOpenMobile(false)}>
                  <n.icon />
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
  const { user } = Route.useRouteContext();

  const signOut = async () => {
    const { logout } = await import("@/lib/auth-api");
    await logout().catch(() => {});
    router.navigate({ to: "/auth", search: { next: undefined }, replace: true });
  };

  useGotoHotkey("d", () => router.navigate({ to: "/" }));
  useGotoHotkey("p", () =>
    router.navigate({ to: "/produto", search: { plu: undefined, store: undefined } }),
  );
  useGotoHotkey("a", () => router.navigate({ to: "/area" }));
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
              <img src="/gpa-logo-mini.png" alt="GPA" className="h-9 w-auto" />
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
        <SidebarInset className="overflow-hidden">
          <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur">
            <div className="mx-auto flex h-16 max-w-[1400px] items-center gap-4 px-4 md:px-8">
              <Link
                to="/"
                className="flex items-center gap-2 font-display text-lg font-bold md:hidden"
              >
                <img src="/gpa-logo-mini.png" alt="GPA" className="h-9 w-auto" />
              </Link>
              <div className="ml-auto flex items-center gap-3">
                <span className="hidden md:block text-xs text-muted-foreground">{user.email}</span>
                <ThemeToggle />
                <SidebarTrigger className="hidden md:flex" />
              </div>
            </div>
          </header>
          <main
            id="main-content"
            className="mx-auto flex w-full max-w-[1400px] flex-1 flex-col px-4 py-6 md:px-8 md:py-10 pb-20 md:pb-10 overflow-y-auto"
          >
            <div className="transition-opacity duration-150 flex-1">
              <Outlet />
            </div>
            <AppFooter />
          </main>
        </SidebarInset>
        <MobileNav isAdmin={isAdmin} userEmail={user.email} onSignOut={signOut} />
      </SidebarProvider>
    </>
  );
}
