import { createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Mail, Loader2, ShieldCheck, CheckCircle2 } from "lucide-react";

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
    <div className="grid min-h-screen md:grid-cols-2">
      <div className="hidden gradient-hero md:flex md:flex-col md:justify-between md:p-12 text-white">
        <div className="flex items-center gap-3 font-display text-xl font-bold">
          <span className="grid size-10 place-items-center rounded-xl bg-white/10 backdrop-blur">B</span>
          Bench<span className="text-accent">GPA</span>
        </div>
        <div>
          <h1 className="font-display text-4xl font-extrabold leading-tight">
            Inteligência operacional<br />para o varejo.
          </h1>
          <p className="mt-4 max-w-md text-white/80">
            Importe relatórios diários, compare períodos e descubra o desempenho real de cada loja, departamento e produto.
          </p>
          <div className="mt-8 flex items-center gap-2 text-sm text-white/70">
            <ShieldCheck className="size-4" /> Acesso por link mágico — sem senhas.
          </div>
        </div>
        <p className="text-xs text-white/50">© Bench GPA</p>
      </div>

      <div className="flex items-center justify-center p-6 md:p-12">
        <div className="w-full max-w-sm">
          <h2 className="font-display text-2xl font-bold">Entrar</h2>
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
                <><Mail className="mr-2 size-4" /> Enviar link de acesso</>
              )}
            </Button>
          </form>

          {sent && (
            <div className="mt-6 flex items-start gap-2 rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" />
              <span>
                Não encontrou? Verifique a caixa de spam. O link expira em 1 hora.
              </span>
            </div>
          )}

          <p className="mt-8 text-xs text-muted-foreground">
            Novos cadastros aguardam aprovação de um administrador.
          </p>
        </div>
      </div>
    </div>
  );
}
