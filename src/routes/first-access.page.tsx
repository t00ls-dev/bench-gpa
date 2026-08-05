import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Link } from "@tanstack/react-router";
import { KeyRound, Loader2 } from "lucide-react";
import { useTurnstile } from "@/hooks/use-turnstile";

function FirstAccessPage() {
  const [username, setUsername] = useState("");
  const [matricula, setMatricula] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const {
    ref: turnstileRef,
    token: turnstileToken,
    reset: resetTurnstile,
    bypass,
  } = useTurnstile();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !matricula || !newPassword || !confirmPassword || loading) return;

    if (newPassword !== confirmPassword) {
      toast.error("As senhas não coincidem.");
      return;
    }
    if (!bypass && !turnstileToken) {
      toast.error("Resolva o desafio de segurança e tente novamente.");
      return;
    }

    setLoading(true);

    try {
      const { setInitialPassword } = await import("@/lib/auth-api");
      const payload: {
        username: string;
        matricula: string;
        newPassword: string;
        confirmPassword: string;
        turnstileToken?: string;
      } = {
        username: username.trim(),
        matricula: matricula.trim(),
        newPassword,
        confirmPassword,
      };
      if (!bypass) payload.turnstileToken = turnstileToken;
      await setInitialPassword({ data: payload });
      window.location.href = "/";
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro ao definir a senha.";
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
          <h2 className="font-display text-xl font-semibold">Primeiro acesso</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Confirme seu usuário e matrícula e defina sua senha.
          </p>

          <form onSubmit={submit} className="mt-6 space-y-4">
            <div>
              <Label htmlFor="fa-username">Usuário</Label>
              <Input
                id="fa-username"
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="mt-1.5"
                autoComplete="username"
              />
            </div>
            <div>
              <Label htmlFor="fa-matricula">Matrícula</Label>
              <Input
                id="fa-matricula"
                type="text"
                inputMode="numeric"
                required
                value={matricula}
                onChange={(e) => setMatricula(e.target.value)}
                className="mt-1.5"
              />
            </div>
            <div>
              <Label htmlFor="fa-new-password">Nova senha</Label>
              <Input
                id="fa-new-password"
                type="password"
                required
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="mt-1.5"
                autoComplete="new-password"
              />
            </div>
            <div>
              <Label htmlFor="fa-confirm-password">Confirmar senha</Label>
              <Input
                id="fa-confirm-password"
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="mt-1.5"
                autoComplete="new-password"
              />
              {confirmPassword && newPassword !== confirmPassword && (
                <p className="mt-1.5 text-xs text-destructive">As senhas não coincidem.</p>
              )}
            </div>

            {!bypass && <div className="flex justify-center" ref={turnstileRef} />}

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <>
                  <KeyRound className="mr-2 size-4" /> Definir senha e entrar
                </>
              )}
            </Button>
          </form>

          <p className="mt-4 text-center text-sm text-muted-foreground">
            Já tem uma senha?{" "}
            <Link
              to="/auth"
              search={{ next: undefined }}
              className="font-medium text-primary underline"
            >
              Voltar para o login
            </Link>
            .
          </p>
        </div>
      </div>
    </div>
  );
}

export default FirstAccessPage;
