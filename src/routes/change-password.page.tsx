import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useSearch } from "@tanstack/react-router";
import { KeyRound, Loader2, ShieldAlert } from "lucide-react";
import { Route as ChangePasswordRoute } from "./change-password";
import { sanitizeNext } from "@/lib/sanitize-next";

function ChangePasswordPage() {
  const { passwordChangeRequired } = ChangePasswordRoute.useRouteContext();
  const { next } = useSearch({ from: "/change-password" });
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentPassword || !newPassword || !confirmPassword || loading) return;

    if (newPassword !== confirmPassword) {
      toast.error("As senhas não coincidem.");
      return;
    }
    if (newPassword.length < 8) {
      toast.error("A nova senha precisa ter ao menos 8 caracteres.");
      return;
    }

    setLoading(true);
    try {
      const { changePassword } = await import("@/lib/auth-api");
      await changePassword({ data: { currentPassword, newPassword, confirmPassword } });
      toast.success("Senha atualizada.");
      window.location.href = sanitizeNext(next, window.location.origin);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro ao trocar a senha.";
      toast.error(msg);
      setLoading(false);
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
          <h2 className="font-display text-xl font-semibold">Trocar senha</h2>

          {passwordChangeRequired ? (
            <div className="mt-3 flex items-start gap-2 rounded-md bg-warning/15 p-3 text-sm text-warning">
              <ShieldAlert className="mt-0.5 size-4 shrink-0" />
              <p>Sua senha expirou (mais de 30 dias). Defina uma nova senha para continuar.</p>
            </div>
          ) : (
            <p className="mt-1 text-sm text-muted-foreground">
              Informe a senha atual e a nova senha.
            </p>
          )}

          {/* Sem autoFocus em nenhum campo, de propósito: evita abrir o
              teclado sozinho em dispositivos móveis ao entrar na tela. */}
          <form onSubmit={submit} className="mt-6 space-y-4">
            <div>
              <Label htmlFor="cp-current-password">Senha atual</Label>
              <Input
                id="cp-current-password"
                type="password"
                required
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="mt-1.5"
                autoComplete="current-password"
              />
            </div>
            <div>
              <Label htmlFor="cp-new-password">Nova senha</Label>
              <Input
                id="cp-new-password"
                type="password"
                required
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="mt-1.5"
                autoComplete="new-password"
              />
              <p className="mt-1.5 text-xs text-muted-foreground">Mínimo de 8 caracteres.</p>
            </div>
            <div>
              <Label htmlFor="cp-confirm-password">Confirmar nova senha</Label>
              <Input
                id="cp-confirm-password"
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

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <>
                  <KeyRound className="mr-2 size-4" /> Trocar senha
                </>
              )}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}

export default ChangePasswordPage;
