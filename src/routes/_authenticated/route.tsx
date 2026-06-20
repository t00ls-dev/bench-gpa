import { createFileRoute, Outlet, redirect, Link, useRouter } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useState } from "react";
import { LayoutDashboard, Upload, Package, Users, LogOut, Menu, X, TrendingDown, Layers } from "lucide-react";
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
  const [profile, setProfile] = useState<{ status: string; isAdmin: boolean } | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    (async () => {
      const [{ data: p }, { data: r }] = await Promise.all([
        supabase.from("profiles").select("status").eq("id", user.id).maybeSingle(),
        supabase.from("user_roles").select("role").eq("user_id", user.id),
      ]);
      setProfile({
        status: p?.status ?? "pending",
        isAdmin: (r ?? []).some((x) => x.role === "admin"),
      });
    })();
  }, [user.id]);

  const signOut = async () => {
    await supabase.auth.signOut();
    router.navigate({ to: "/auth", replace: true });
  };

  if (!profile) {
    return <div className="flex min-h-screen items-center justify-center text-muted-foreground">Carregando…</div>;
  }

  if (profile.status !== "approved") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-6">
        <div className="kpi-card max-w-md text-center">
          <h1 className="text-2xl font-semibold">
            {profile.status === "blocked" ? "Acesso bloqueado" : "Aguardando aprovação"}
          </h1>
          <p className="mt-3 text-muted-foreground">
            {profile.status === "blocked"
              ? "Seu acesso foi bloqueado por um administrador."
              : "Seu cadastro foi recebido. Aguarde a liberação por um administrador."}
          </p>
          <p className="mt-4 text-sm text-muted-foreground">Conta: {user.email}</p>
          <Button variant="outline" className="mt-6" onClick={signOut}>
            <LogOut className="mr-2 size-4" /> Sair
          </Button>
        </div>
      </div>
    );
  }

  const nav = [
    { to: "/", label: "Dashboard", icon: LayoutDashboard },
    ...(profile.isAdmin ? [{ to: "/upload", label: "Importar", icon: Upload }] : []),
    { to: "/produto", label: "Produto", icon: Package },
    { to: "/area", label: "Área", icon: Layers },
    { to: "/queda", label: "Em Queda", icon: TrendingDown },
    ...(profile.isAdmin ? [{ to: "/admin", label: "Usuários", icon: Users }] : []),
  ] as const;


  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-[1400px] items-center gap-4 px-4 md:px-8">
          <Link to="/" className="flex items-center gap-2 font-display text-lg font-bold">
            <span className="grid size-9 place-items-center rounded-xl bg-[image:var(--gradient-primary)] text-primary-foreground shadow-[var(--shadow-card)]">B</span>
            Bench<span className="text-primary">GPA</span>
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
