import { useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Route } from "./auth";
import { LogIn, Loader2 } from "lucide-react";

function sanitizeNext(next: unknown): string {
  if (typeof next !== "string") return "/";
  if (!next.startsWith("/") || next.startsWith("//")) return "/";
  return next;
}

function AuthPage() {
  const router = useRouter();
  const { next } = Route.useSearch();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const goNext = () => {
    const target = sanitizeNext(next);
    if (target !== "/") {
      const u = new URL(target, window.location.origin);
      router.navigate({ to: u.pathname, search: Object.fromEntries(u.searchParams.entries()) });
    } else {
      router.navigate({ to: "/" });
    }
  };

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN") goNext();
    });
    return () => sub.subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router, next]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password || loading) return;
    setLoading(true);
    const normalized = email.trim().toLowerCase();
    const { data: signInData, error } = await supabase.auth.signInWithPassword({
      email: normalized,
      password,
    });
    if (error || !signInData.user) {
      setLoading(false);
      toast.error("E-mail ou senha inválidos.");
      return;
    }

    const { data: u } = await supabase
      .from("users")
      .select("is_active")
      .eq("id", signInData.user.id)
      .maybeSingle();

    if (!u || !u.is_active) {
      await supabase.auth.signOut();
      setLoading(false);
      toast.error("Usuário inativo, procure o administrador.");
      return;
    }

    setLoading(false);
    goNext();
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <img src="/gpa-logo.png" alt="Grupo Pão de Açúcar" className="h-24 w-auto max-w-full" />
        </div>

        <div className="kpi-card">
          <h2 className="font-display text-xl font-semibold">Entrar</h2>
          <p className="mt-1 text-sm text-muted-foreground">Acesse com seu e-mail e senha.</p>

          <form onSubmit={submit} className="mt-6 space-y-4">
            <div>
              <Label htmlFor="email">E-mail</Label>
              <Input
                id="email"
                type="email"
                required
                placeholder="uilton.leite@gpabr.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1.5"
                autoComplete="username"
              />
            </div>
            <div>
              <Label htmlFor="password">Senha</Label>
              <Input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1.5"
                autoComplete="current-password"
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <>
                  <LogIn className="mr-2 size-4" /> Entrar
                </>
              )}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}

export default AuthPage;
