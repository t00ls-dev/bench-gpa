import { createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Mail, Loader2, CheckCircle2 } from "lucide-react";

export const Route = createFileRoute("/auth")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (data.user) throw redirect({ to: "/" });
  },
  component: AuthPage,
});

function AuthPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN") router.navigate({ to: "/" });
    });
    return () => sub.subscription.unsubscribe();
  }, [router]);

  const sendLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || loading || cooldown > 0) return;
    setLoading(true);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin },
    });
    setLoading(false);
    if (error) return toast.error(error.message);
    setSent(true);
    setCooldown(45);
    toast.success("Link de acesso enviado para seu e-mail.");
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <span className="grid size-14 place-items-center rounded-2xl bg-[image:var(--gradient-primary)] text-primary-foreground shadow-[var(--shadow-card)] font-display text-2xl font-bold">
            B
          </span>
          <div className="font-display text-2xl font-bold">
            Bench<span className="text-primary">GPA</span>
          </div>
          <p className="text-xs text-muted-foreground">Business Intelligence</p>
        </div>

        <div className="kpi-card">
          <h2 className="font-display text-xl font-semibold">Entrar</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {sent
              ? `Enviamos um link de acesso para ${email}. Abra o e-mail no mesmo dispositivo para entrar.`
              : "Informe seu e-mail corporativo para receber um link de acesso."}
          </p>

          <form onSubmit={sendLink} className="mt-6 space-y-4">
            <div>
              <Label htmlFor="email">E-mail</Label>
              <Input
                id="email"
                type="email"
                required
                placeholder="voce@empresa.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1.5"
                autoComplete="email"
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading || cooldown > 0}>
              {loading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : cooldown > 0 ? (
                `Reenviar em ${cooldown}s`
              ) : sent ? (
                <><Mail className="mr-2 size-4" /> Reenviar link</>
              ) : (
                <><Mail className="mr-2 size-4" /> Entrar</>
              )}
            </Button>
          </form>

          {sent && (
            <div className="mt-6 flex items-start gap-2 rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" />
              <span>Não encontrou? Verifique a caixa de spam. O link expira em 1 hora.</span>
            </div>
          )}
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Sistema de uso interno. Novos cadastros aguardam aprovação.
        </p>
      </div>
    </div>
  );
}
