import { createFileRoute, Outlet, redirect, Link, useRouter } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useState } from "react";
import { LayoutDashboard, Upload, Package, Users, LogOut, Menu, X, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: AuthedLayout,
});

function AuthedLayout() {
  const router = useRouter();
  const { user } = Route.useRouteContext();
  const [profile, setProfile] = useState<{ isActive: boolean; isAdmin: boolean } | null>(null);
  const [open, setOpen] = useState(false);

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
    return <div className="flex min-h-screen items-center justify-center text-muted-foreground">Carregando…</div>;
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
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-[1400px] items-center gap-4 px-4 md:px-8">
          <Link to="/" className="flex items-center gap-2 font-display text-lg font-bold">
            <img src="/gpa-logo-mini.png" alt="GPA" className="h-9 w-auto" />
          </Link>
          <nav className="ml-6 hidden items-center gap-1 md:flex">
            {nav.map((n) => (
              <Link
                key={n.to}
                to={n.to}
                className="flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground"
                activeProps={{ className: "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium bg-primary/10 text-primary" }}
                activeOptions={{ exact: n.to === "/" }}
              >
                <n.icon className="size-4" /> {n.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto hidden items-center gap-3 md:flex">
            <span className="text-xs text-muted-foreground">{user.email}</span>
            <Button variant="ghost" size="sm" onClick={signOut}>
              <LogOut className="size-4" />
            </Button>
          </div>
          <button className="ml-auto md:hidden" onClick={() => setOpen(!open)} aria-label="Menu">
            {open ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
        {open && (
          <nav className="border-t border-border bg-card px-4 py-3 md:hidden">
            {nav.map((n) => (
              <Link
                key={n.to}
                to={n.to}
                onClick={() => setOpen(false)}
                className="flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground"
                activeProps={{ className: "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium bg-primary/10 text-primary" }}
                activeOptions={{ exact: n.to === "/" }}
              >
                <n.icon className="size-4" /> {n.label}
              </Link>
            ))}
            <button onClick={signOut} className="mt-2 flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground">
              <LogOut className="size-4" /> Sair ({user.email})
            </button>
          </nav>
        )}
      </header>
      <main className="mx-auto max-w-[1400px] px-4 py-6 md:px-8 md:py-10">
        <Outlet />
      </main>
    </div>
  );
}
