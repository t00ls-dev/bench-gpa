import { createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Mail, Loader2, ShieldCheck } from "lucide-react";

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
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");
  const [loading, setLoading] = useState(false);

  const sendLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setLoading(true);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin },
    });
    setLoading(false);
    if (error) return toast.error(error.message);
    setStep("code");
    toast.success("Enviamos um link e um código para seu e-mail.");
  };

  const verify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code) return;
    setLoading(true);
    const { error } = await supabase.auth.verifyOtp({ email, token: code, type: "email" });
    setLoading(false);
    if (error) return toast.error(error.message);
    router.navigate({ to: "/" });
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
            {step === "email" ? "Use seu e-mail corporativo." : `Digite o código enviado para ${email}.`}
          </p>

          {step === "email" ? (
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
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? <Loader2 className="size-4 animate-spin" /> : <><Mail className="mr-2 size-4" /> Enviar link mágico</>}
              </Button>
            </form>
          ) : (
            <form onSubmit={verify} className="mt-6 space-y-4">
              <div>
                <Label htmlFor="code">Código de 6 dígitos</Label>
                <Input
                  id="code"
                  inputMode="numeric"
                  pattern="\d{6}"
                  required
                  placeholder="000000"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  className="mt-1.5 tracking-widest text-center"
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? <Loader2 className="size-4 animate-spin" /> : "Entrar"}
              </Button>
              <button type="button" onClick={() => setStep("email")} className="block w-full text-center text-xs text-muted-foreground hover:text-foreground">
                Usar outro e-mail
              </button>
            </form>
          )}

          <p className="mt-8 text-xs text-muted-foreground">
            Novos cadastros aguardam aprovação de um administrador.
          </p>
        </div>
      </div>
    </div>
  );
}
