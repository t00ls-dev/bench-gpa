import { useEffect, useState } from "react";
import { Loader2, ShieldOff, WifiOff } from "lucide-react";

export function AdminGate({
  children,
  isAdmin: knownAdmin,
}: {
  children: React.ReactNode;
  isAdmin?: boolean;
}) {
  const [state, setState] = useState<"loading" | "allow" | "deny" | "error">(
    knownAdmin ? "allow" : "loading",
  );

  useEffect(() => {
    if (knownAdmin) return;
    (async () => {
      try {
        const { getMe } = await import("@/lib/auth-api");
        const user = await getMe();
        if (!user) return setState("deny");
        setState(user.role === "admin" ? "allow" : "deny");
      } catch {
        setState("error");
      }
    })();
  }, [knownAdmin]);

  if (state === "loading") {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="mr-2 size-4 animate-spin" /> Verificando permissões…
      </div>
    );
  }
  if (state === "error") {
    return (
      <div className="kpi-card mx-auto max-w-md text-center">
        <WifiOff className="mx-auto mb-3 size-8 text-muted-foreground" />
        <h1 className="text-lg font-semibold">Erro de conexão</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Não foi possível verificar suas permissões. Verifique sua conexão e tente novamente.
        </p>
      </div>
    );
  }
  if (state === "deny") {
    return (
      <div className="kpi-card mx-auto max-w-md text-center">
        <ShieldOff className="mx-auto mb-3 size-8 text-muted-foreground" />
        <h1 className="text-lg font-semibold">Acesso restrito</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Esta página é exclusiva para administradores.
        </p>
      </div>
    );
  }
  return <>{children}</>;
}
