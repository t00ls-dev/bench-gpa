import { useRouter } from "@tanstack/react-router";
import { useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Route } from "./auth";
import { LogIn, Loader2 } from "lucide-react";

const TURNSTILE_SITE_KEY =
  import.meta.env.VITE_TURNSTILE_SITE_KEY;
const TURNSTILE_BYPASS = true;

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
  const [turnstileToken, setTurnstileToken] = useState(TURNSTILE_BYPASS ? "bypass" : "");
  const turnstileRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | undefined>(undefined);

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

  useEffect(() => {
    if (TURNSTILE_BYPASS) return;
    if (!TURNSTILE_SITE_KEY || !turnstileRef.current) return;
    if (widgetIdRef.current) return;

    const script = document.createElement("script");
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js";
    script.async = true;
    script.defer = true;
    document.head.appendChild(script);

    let attempts = 0;
    const poll = setInterval(() => {
      if (typeof (window as any).turnstile !== "undefined" && turnstileRef.current) {
        clearInterval(poll);
        widgetIdRef.current = (window as any).turnstile.render(turnstileRef.current, {
          sitekey: TURNSTILE_SITE_KEY,
          theme: "light",
          callback: (token: string) => setTurnstileToken(token),
          "expired-callback": () => setTurnstileToken(""),
          "error-callback": () => setTurnstileToken(""),
        });
      }
      if (++attempts > 100) clearInterval(poll);
    }, 100);

    return () => {
      clearInterval(poll);
      if (widgetIdRef.current && typeof (window as any).turnstile !== "undefined") {
        (window as any).turnstile.remove(widgetIdRef.current);
      }
      script.remove();
    };
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password || loading) return;

    if (!TURNSTILE_BYPASS && !turnstileToken) {
      toast.error("Aguardando verificação de segurança. Tente novamente.");
      return;
    }

    setLoading(true);

    try {
      const { login } = await import("@/lib/auth.functions");
      const session = await login({
        data: {
          email: email.trim().toLowerCase(),
          password,
          turnstileToken,
        },
      });

      await supabase.auth.setSession({
        access_token: session.accessToken,
        refresh_token: session.refreshToken,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro ao fazer login.";
      toast.error(msg);
      setLoading(false);
      setTurnstileToken("");
      if (turnstileRef.current && typeof (window as any).turnstile !== "undefined") {
        (window as any).turnstile.reset(widgetIdRef.current);
      }
    }
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

            <div className="flex justify-center" ref={turnstileRef} />

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
