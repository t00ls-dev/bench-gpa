import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, ShieldOff } from "lucide-react";

export function AdminGate({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<"loading" | "allow" | "deny">("loading");
  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return setState("deny");
      const { data, error } = await supabase.rpc("has_role", {
        _user_id: u.user.id,
        _role: "admin",
      });
      setState(!error && data === true ? "allow" : "deny");
    })();
  }, []);
  if (state === "loading") {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="mr-2 size-4 animate-spin" /> Verificando permissões…
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
