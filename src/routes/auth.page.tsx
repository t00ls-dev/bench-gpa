import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Link, useSearch } from "@tanstack/react-router";
import { LogIn, Loader2 } from "lucide-react";
import { sanitizeNext } from "@/lib/sanitize-next";
import { useTurnstile } from "@/hooks/use-turnstile";

function AuthPage() {
  const { next } = useSearch({ from: "/auth" });
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const {
    ref: turnstileRef,
    token: turnstileToken,
    reset: resetTurnstile,
    bypass,
  } = useTurnstile();

  const goNext = () => {
    const target = sanitizeNext(next, window.location.origin);
    window.location.href = target;
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!identifier || !password || loading) return;

    if (!bypass && !turnstileToken) {
      toast.error("Resolva o desafio de segurança e tente novamente.");
      return;
    }

    setLoading(true);

    try {
      const { login } = await import("@/lib/auth-api");
      const payload: {
        identifier: string;
        password: string;
        turnstileToken?: string;
        rememberMe: boolean;
      } = {
        identifier: identifier.trim(),
        password,
        rememberMe,
      };
      if (!bypass) payload.turnstileToken = turnstileToken;
      await login({ data: payload });
      goNext();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro ao fazer login.";
      toast.error(msg);
      setLoading(false);
      if (!bypass) resetTurnstile();
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <img
            src="/brand/gpa-logo.webp"
            alt="Grupo Pão de Açúcar"
            className="h-24 w-auto max-w-full"
          />
        </div>

        <div className="kpi-card">
          <h2 className="font-display text-xl font-semibold">Entrar</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Acesse com seu usuário ou matrícula e senha.
          </p>

          <form onSubmit={submit} className="mt-6 space-y-4">
            <div>
              <Label htmlFor="identifier">Usuário</Label>
              <Input
                id="identifier"
                type="text"
                required
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
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

            <div className="flex items-center gap-2">
              <Switch id="remember-me" checked={rememberMe} onCheckedChange={setRememberMe} />
              <Label htmlFor="remember-me">Manter-me conectado por 7 dias</Label>
            </div>

            {!bypass && <div className="flex justify-center" ref={turnstileRef} />}

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

          <p className="mt-4 text-center text-sm text-muted-foreground">
            Primeiro acesso?{" "}
            <Link to="/first-access" className="font-medium text-primary underline">
              Defina sua senha aqui
            </Link>
            .
          </p>
        </div>
      </div>
    </div>
  );
}

export default AuthPage;
