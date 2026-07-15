import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { setUserRole, setUserActive } from "@/lib/admin.functions";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { ShieldCheck, ShieldOff, KeyRound } from "lucide-react";
import { fmtBRShort } from "@/lib/utils";
import { CreateUserDialog } from "@/components/create-user-dialog";
import { ResetPasswordDialog } from "@/components/reset-password-dialog";

interface User {
  id: string;
  email: string;
  name: string;
  role: string;
  is_active: boolean;
  created_at: string;
}

export function AdminUserManagement({
  data,
  isLoading,
}: {
  data: User[] | undefined;
  isLoading: boolean;
}) {
  const setRole = useServerFn(setUserRole);
  const setActive = useServerFn(setUserActive);
  const qc = useQueryClient();

  const action = async (fn: Promise<any>, msg: string) => {
    try {
      await fn;
      toast.success(msg);
      qc.invalidateQueries({ queryKey: ["admin-users"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Erro");
    }
  };

  const [resetTarget, setResetTarget] = useState<{ id: string; email: string } | null>(null);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Cadastre novos usuários, ative/inative, redefina senhas e alterne o papel.
        </p>
        <CreateUserDialog onCreated={() => qc.invalidateQueries({ queryKey: ["admin-users"] })} />
      </div>

      <div className="kpi-card overflow-x-auto p-0">
        {isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-3">E-mail</th>
                <th className="px-4 py-3">Nome</th>
                <th className="px-4 py-3">Papel</th>
                <th className="px-4 py-3">Ativo</th>
                <th className="px-4 py-3">Cadastro</th>
                <th className="px-4 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {(data ?? []).map((u) => {
                const isAdmin = u.role === "admin";
                return (
                  <tr key={u.id} className="border-b border-border/60">
                    <td className="px-4 py-3 font-medium">{u.email}</td>
                    <td className="px-4 py-3">{u.name}</td>
                    <td className="px-4 py-3 text-xs">{isAdmin ? "Administrador" : "Usuário"}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={u.is_active}
                          onCheckedChange={(v) =>
                            action(setActive({ data: { userId: u.id, isActive: v } }),
                              v ? "Usuário ativado" : "Usuário inativado")
                          }
                        />
                        <span className="text-xs text-muted-foreground">
                          {u.is_active ? "Ativo" : "Inativo"}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {fmtBRShort(new Date(u.created_at))}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1.5">
                        <Button size="sm" variant="outline"
                          title={isAdmin ? "Remover administrador" : "Tornar administrador"}
                          aria-label={isAdmin ? "Remover administrador" : "Tornar administrador"}
                          onClick={() =>
                            action(setRole({ data: { userId: u.id, role: isAdmin ? "user" : "admin" } }),
                              isAdmin ? "Admin removido" : "Promovido a admin")
                          }
                        >
                          {isAdmin ? <ShieldOff className="size-3.5" /> : <ShieldCheck className="size-3.5" />}
                        </Button>
                        <Button size="sm" variant="outline"
                          title="Redefinir senha" aria-label="Redefinir senha"
                          onClick={() => { setResetTarget({ id: u.id, email: u.email }); }}
                        >
                          <KeyRound className="size-3.5" />
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

      <ResetPasswordDialog
        target={resetTarget}
        onClose={() => setResetTarget(null)}
        onReset={() => qc.invalidateQueries({ queryKey: ["admin-users"] })}
      />
    </div>
  );
}
