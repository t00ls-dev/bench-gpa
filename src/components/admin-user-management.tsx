import { useState } from "react";
import { useResetOnChange } from "@/hooks/use-reset-on-change";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { setUserRole, setUserActive } from "@/lib/admin-users.functions";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import {
  ShieldCheck,
  ShieldOff,
  KeyRound,
  Loader2,
  Search,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { fmtBRShort, fmtInt } from "@/lib/utils";
import { AREA_PAGE_SIZE_OPTIONS } from "@/lib/schemas";
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

  const [resetTarget, setResetTarget] = useState<{ id: string; email: string } | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<(typeof AREA_PAGE_SIZE_OPTIONS)[number]>(25);
  const [pending, setPending] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{
    type: "role" | "active";
    user: User;
    newValue: boolean;
  } | null>(null);

  const action = async (fn: Promise<unknown>, msg: string, key: string) => {
    setPending(key);
    try {
      await fn;
      toast.success(msg);
      qc.invalidateQueries({ queryKey: ["admin-users"] });
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erro");
    } finally {
      setPending(null);
    }
  };

  const filtered = (data ?? []).filter(
    (u) =>
      u.email.toLowerCase().includes(search.toLowerCase()) ||
      u.name.toLowerCase().includes(search.toLowerCase()),
  );

  // Busca/tamanho de página novos podem deixar a página atual fora do range
  // (ex.: filtrar de 3 páginas pra 1) — volta pra 1 em vez de mostrar vazio.
  useResetOnChange([search, pageSize], () => setPage(1));

  const totalRows = filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
  const pageClamped = Math.min(page, totalPages);
  const paged = filtered.slice((pageClamped - 1) * pageSize, pageClamped * pageSize);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="relative grow max-w-xs">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Buscar por email ou nome…"
            aria-label="Buscar por email ou nome"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2">
          <Select
            value={String(pageSize)}
            onValueChange={(v) => setPageSize(Number(v) as (typeof AREA_PAGE_SIZE_OPTIONS)[number])}
          >
            <SelectTrigger className="h-9 w-[110px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {AREA_PAGE_SIZE_OPTIONS.map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {n} / página
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <CreateUserDialog onCreated={() => qc.invalidateQueries({ queryKey: ["admin-users"] })} />
        </div>
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
              {paged.map((u) => {
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
                          disabled={pending === `active:${u.id}`}
                          aria-label={u.is_active ? `Desativar ${u.email}` : `Ativar ${u.email}`}
                          onCheckedChange={(v) =>
                            setConfirm({ type: "active", user: u, newValue: v })
                          }
                        />
                        {pending === `active:${u.id}` ? (
                          <Loader2 className="size-3 animate-spin text-muted-foreground" />
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            {u.is_active ? "Ativo" : "Inativo"}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {fmtBRShort(new Date(u.created_at))}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1.5">
                        <Button
                          size="sm"
                          variant="outline"
                          title={isAdmin ? "Remover administrador" : "Tornar administrador"}
                          aria-label={isAdmin ? "Remover administrador" : "Tornar administrador"}
                          disabled={pending === `role:${u.id}`}
                          onClick={() => setConfirm({ type: "role", user: u, newValue: !isAdmin })}
                        >
                          {pending === `role:${u.id}` ? (
                            <Loader2 className="size-3.5 animate-spin" />
                          ) : isAdmin ? (
                            <ShieldOff className="size-3.5" />
                          ) : (
                            <ShieldCheck className="size-3.5" />
                          )}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          title="Redefinir senha"
                          aria-label="Redefinir senha"
                          onClick={() => {
                            setResetTarget({ id: u.id, email: u.email });
                          }}
                        >
                          <KeyRound className="size-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && !isLoading && (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                    {search ? "Nenhum usuário encontrado." : "Nenhum usuário cadastrado."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {!isLoading && totalRows > 0 && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <div>
            Exibindo {(pageClamped - 1) * pageSize + 1}–
            {Math.min(pageClamped * pageSize, totalRows)} de {fmtInt(totalRows)} usuários
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={pageClamped <= 1}
              aria-label="Página anterior"
              onClick={() => setPage(pageClamped - 1)}
            >
              <ChevronLeft className="size-4" />
            </Button>
            <span>
              Página {pageClamped} de {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={pageClamped >= totalPages}
              aria-label="Próxima página"
              onClick={() => setPage(pageClamped + 1)}
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      )}

      <AlertDialog open={confirm !== null} onOpenChange={(o) => !o && setConfirm(null)}>
        {confirm && (
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {confirm.type === "role"
                  ? confirm.newValue
                    ? "Promover a administrador?"
                    : "Remover administrador?"
                  : confirm.newValue
                    ? "Ativar usuário?"
                    : "Inativar usuário?"}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {confirm.type === "role"
                  ? confirm.newValue
                    ? `Tem certeza que deseja tornar "${confirm.user.email}" administrador?`
                    : `Tem certeza que deseja remover "${confirm.user.email}" do papel de administrador?`
                  : confirm.newValue
                    ? `Tem certeza que deseja ativar "${confirm.user.email}"?`
                    : `Tem certeza que deseja inativar "${confirm.user.email}"? O usuário não poderá acessar o sistema.`}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={async () => {
                  if (!confirm) return;
                  const c = confirm;
                  setConfirm(null);
                  if (c.type === "role") {
                    await action(
                      setRole({ data: { userId: c.user.id, role: c.newValue ? "admin" : "user" } }),
                      c.newValue ? "Promovido a admin" : "Admin removido",
                      `role:${c.user.id}`,
                    );
                  } else {
                    await action(
                      setActive({ data: { userId: c.user.id, isActive: c.newValue } }),
                      c.newValue ? "Usuário ativado" : "Usuário inativado",
                      `active:${c.user.id}`,
                    );
                  }
                }}
              >
                Confirmar
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        )}
      </AlertDialog>

      <ResetPasswordDialog
        target={resetTarget}
        onClose={() => setResetTarget(null)}
        onReset={() => qc.invalidateQueries({ queryKey: ["admin-users"] })}
      />
    </div>
  );
}
