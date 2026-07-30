import { useQuery } from "@tanstack/react-query";
import { Loader2, ShieldOff, WifiOff } from "lucide-react";
import { QUERY_STALE_IDENTITY } from "@/lib/query-config";

export function AdminGate({
  children,
  isAdmin: knownAdmin,
}: {
  children: React.ReactNode;
  isAdmin?: boolean;
}) {
  // Reusa o mesmo cache ["me"] populado pelo beforeLoad do layout autenticado,
  // evitando uma segunda ida ao servidor só para checar a role.
  const {
    data: user,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["me"],
    queryFn: async () => (await import("@/lib/auth-api")).getMe(),
    staleTime: QUERY_STALE_IDENTITY,
    enabled: !knownAdmin,
    retry: false,
  });

  const state: "loading" | "allow" | "deny" | "error" = knownAdmin
    ? "allow"
    : isLoading
      ? "loading"
      : isError
        ? "error"
        : user?.role === "admin"
          ? "allow"
          : "deny";

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
