import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listUsers, setUserStatus, setUserRole } from "@/lib/admin.functions";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { ShieldCheck, ShieldOff, UserCheck, UserX, Loader2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin")({
  component: AdminPage,
});

function AdminPage() {
  const list = useServerFn(listUsers);
  const setStatus = useServerFn(setUserStatus);
  const setRole = useServerFn(setUserRole);
  const qc = useQueryClient();
  const [err, setErr] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-users"],
    queryFn: () => list(),
    retry: false,
  });

  useEffect(() => {
    if (error) setErr((error as Error).message);
  }, [error]);

  const action = async (fn: Promise<any>, msg: string) => {
    try {
      await fn;
      toast.success(msg);
      qc.invalidateQueries({ queryKey: ["admin-users"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Erro");
    }
  };

  if (err) {
    return (
      <div className="kpi-card text-center">
        <p className="text-sm text-destructive">{err}</p>
      </div>
    );
  }

  return (
    <div>
      <header className="mb-6">
        <h1 className="font-display text-3xl font-bold">Usuários</h1>
        <p className="text-sm text-muted-foreground">Aprove, bloqueie ou conceda permissão de administrador.</p>
      </header>

      <div className="kpi-card overflow-x-auto p-0">
        {isLoading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <Loader2 className="mr-2 size-4 animate-spin" /> Carregando…
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-3">E-mail</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Papéis</th>
                <th className="px-4 py-3">Cadastro</th>
                <th className="px-4 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {(data ?? []).map((u) => {
                const isAdmin = u.roles.includes("admin");
                return (
                  <tr key={u.id} className="border-b border-border/60">
                    <td className="px-4 py-3 font-medium">{u.email}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                        u.status === "approved" ? "bg-[oklch(0.94_0.06_155)] text-[oklch(0.4_0.13_155)]"
                        : u.status === "blocked" ? "bg-destructive/10 text-destructive"
                        : "bg-[oklch(0.95_0.05_75)] text-[oklch(0.45_0.13_75)]"
                      }`}>
                        {u.status === "approved" ? "Aprovado" : u.status === "blocked" ? "Bloqueado" : "Pendente"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs">{isAdmin ? "Admin" : "Usuário"}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {new Date(u.created_at).toLocaleDateString("pt-BR")}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1.5">
                        {u.status !== "approved" && (
                          <Button size="sm" variant="outline" onClick={() => action(setStatus({ data: { userId: u.id, status: "approved" } }), "Aprovado")}>
                            <UserCheck className="size-3.5" />
                          </Button>
                        )}
                        {u.status !== "blocked" && (
                          <Button size="sm" variant="outline" onClick={() => action(setStatus({ data: { userId: u.id, status: "blocked" } }), "Bloqueado")}>
                            <UserX className="size-3.5" />
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => action(setRole({ data: { userId: u.id, role: "admin", grant: !isAdmin } }), isAdmin ? "Admin removido" : "Promovido a admin")}
                        >
                          {isAdmin ? <ShieldOff className="size-3.5" /> : <ShieldCheck className="size-3.5" />}
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
