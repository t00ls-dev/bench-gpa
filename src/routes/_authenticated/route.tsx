import { createFileRoute, Outlet, redirect, Link, useRouter, useLocation } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useState } from "react";
import { LayoutDashboard, Upload, Package, Users, LogOut, Layers, Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useTheme } from "@/hooks/use-theme";
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
} from "@/components/ui/sidebar";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      const next = location.pathname + location.searchStr;
      throw redirect({ to: "/auth", search: next && next !== "/" ? { next } : undefined });
    }
    return { user: data.user };
  },
  component: AuthedLayout,
});

function AuthedLayout() {
  const router = useRouter();
  const loc = useLocation();
  const { user } = Route.useRouteContext();
  const { theme, toggle } = useTheme();
  const [profile, setProfile] = useState<{ isActive: boolean; isAdmin: boolean } | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("users")
        .select("is_active, role")
        .eq("id", user.id)
        .maybeSingle();
      if (!data || !data.is_active) {
        await supabase.auth.signOut();
        router.navigate({ to: "/auth", replace: true });
        return;
      }
      setProfile({ isActive: true, isAdmin: data.role === "admin" });
    })();
  }, [user.id, router]);

  const signOut = async () => {
    await supabase.auth.signOut();
    router.navigate({ to: "/auth", replace: true });
  };

  if (!profile) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Skeleton className="size-10 rounded-full" />
          <Skeleton className="h-4 w-32" />
        </div>
      </div>
    );
  }

  const nav = [
    { to: "/", label: "Dashboard", icon: LayoutDashboard },
    { to: "/produto", label: "Produto", icon: Package },
    { to: "/area", label: "Área", icon: Layers },
    ...(profile.isAdmin
      ? [
          { to: "/upload", label: "Importar", icon: Upload },
          { to: "/admin", label: "Usuários", icon: Users },
        ]
      : []),
  ] as const;

  return (
    <SidebarProvider defaultOpen={true}>
      <Sidebar collapsible="offcanvas">
        <SidebarHeader>
          <Link to="/" className="flex items-center gap-2 px-3 py-2 font-display text-lg font-bold">
            <img src="/gpa-logo-mini.png" alt="GPA" className="h-9 w-auto" />
          </Link>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarMenu>
              {nav.map((n) => (
                <SidebarMenuItem key={n.to}>
                  <SidebarMenuButton asChild isActive={loc.pathname === n.to}>
                    <Link to={n.to}>
                      <n.icon />
                      <span>{n.label}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter>
          <div className="flex items-center gap-2 px-3 py-2">
            <span className="flex-1 truncate text-xs text-sidebar-foreground/60">{user.email}</span>
            <Button variant="ghost" size="icon" onClick={toggle} aria-label="Alternar tema" className="size-7">
              {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
            </Button>
            <Button variant="ghost" size="icon" onClick={signOut} aria-label="Sair" className="size-7">
              <LogOut className="size-4" />
            </Button>
          </div>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset>
        <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur">
          <div className="mx-auto flex h-16 max-w-[1400px] items-center gap-4 px-4 md:px-8">
            <SidebarTrigger className="md:hidden" />
            <Link to="/" className="flex items-center gap-2 font-display text-lg font-bold md:hidden">
              <img src="/gpa-logo-mini.png" alt="GPA" className="h-9 w-auto" />
            </Link>
            <div className="ml-auto flex items-center gap-3">
              <span className="hidden md:block text-xs text-muted-foreground">{user.email}</span>
              <Button variant="ghost" size="icon" onClick={toggle} aria-label="Alternar tema" className="hidden md:inline-flex size-7">
                {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
              </Button>
              <Button variant="ghost" size="icon" onClick={signOut} aria-label="Sair" className="hidden md:inline-flex size-7">
                <LogOut className="size-4" />
              </Button>
              <SidebarTrigger className="hidden md:flex" />
            </div>
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1400px] px-4 py-6 md:px-8 md:py-10">
          <Outlet />
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
