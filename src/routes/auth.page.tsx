import { useEffect, useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useSearch } from "@tanstack/react-router";
import { LogIn, Loader2 } from "lucide-react";
import { useEffectiveTheme } from "@/hooks/use-theme";

const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY;
const TURNSTILE_BYPASS = import.meta.env.VITE_TURNSTILE_BYPASS === "true";

type TurnstileWidget = {
  render: (container: HTMLElement, options: Record<string, unknown>) => string;
  remove: (id: string) => void;
  reset: (id: string) => void;
};

function getTurnstile(): TurnstileWidget | undefined {
  return (window as unknown as { turnstile?: TurnstileWidget }).turnstile;
}

function sanitizeNext(next: unknown): string {
  if (typeof next !== "string") return "/";
  if (!next.startsWith("/") || next.startsWith("//")) return "/";
  return next;
}

function AuthPage() {
  const { next } = useSearch({ from: "/auth" });
  const effectiveTheme = useEffectiveTheme();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState("");
  const turnstileRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | undefined>(undefined);

  const goNext = () => {
    const target = sanitizeNext(next);
    window.location.href = target;
  };

  // Injeta o script do Turnstile uma única vez.
  useEffect(() => {
    if (TURNSTILE_BYPASS || !TURNSTILE_SITE_KEY) return;

    const script = document.createElement("script");
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js";
    script.async = true;
    script.defer = true;
    document.head.appendChild(script);

    return () => {
      script.remove();
    };
  }, []);

  // (Re)renderiza o widget honrando o tema efetivo atual. O Turnstile não
  // permite trocar o tema de um widget já montado, então em mudança de
  // preferência removemos o anterior e renderizamos de novo.
  useEffect(() => {
    if (TURNSTILE_BYPASS) return;
    if (!TURNSTILE_SITE_KEY || !turnstileRef.current) return;

    let attempts = 0;
    const poll = setInterval(() => {
      const ts = getTurnstile();
      if (ts && turnstileRef.current) {
        clearInterval(poll);
        if (widgetIdRef.current) {
          ts.remove(widgetIdRef.current);
          setTurnstileToken("");
        }
        widgetIdRef.current = ts.render(turnstileRef.current, {
          sitekey: TURNSTILE_SITE_KEY,
          theme: effectiveTheme,
          callback: (token: string) => setTurnstileToken(token),
          "expired-callback": () => setTurnstileToken(""),
          "error-callback": () => setTurnstileToken(""),
        });
      }
      if (++attempts > 100) clearInterval(poll);
    }, 100);

    return () => {
      clearInterval(poll);
      const ts = getTurnstile();
      if (widgetIdRef.current && ts) {
        ts.remove(widgetIdRef.current);
        widgetIdRef.current = undefined;
      }
    };
  }, [effectiveTheme]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password || loading) return;

    if (!TURNSTILE_BYPASS && !turnstileToken) {
      toast.error("Resolva o desafio de segurança e tente novamente.");
      return;
    }

    setLoading(true);

    try {
      const { login } = await import("@/lib/auth-api");
      const payload: { email: string; password: string; turnstileToken?: string } = {
        email: email.trim().toLowerCase(),
        password,
      };
      if (!TURNSTILE_BYPASS) payload.turnstileToken = turnstileToken;
      await login({ data: payload });
      goNext();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro ao fazer login.";
      toast.error(msg);
      setLoading(false);
      if (!TURNSTILE_BYPASS) {
        setTurnstileToken("");
      }
      const ts = getTurnstile();
      if (turnstileRef.current && ts && widgetIdRef.current) {
        ts.reset(widgetIdRef.current);
      }
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <img src="/gpa-logo.webp" alt="Grupo Pão de Açúcar" className="h-24 w-auto max-w-full" />
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
                placeholder="nome.sobrenome@gpabr.com"
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

            {!TURNSTILE_BYPASS && <div className="flex justify-center" ref={turnstileRef} />}

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
