import { useMemo, useState } from "react";
import { useResetOnChange } from "@/hooks/use-reset-on-change";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Pencil, Search, ChevronLeft, ChevronRight } from "lucide-react";
import { fmtDT, fmtInt } from "@/lib/utils";
import { DEFAULT_PAGE_SIZE, PAGE_SIZE_OPTIONS } from "@/lib/schemas";
import { CreateUserDialog } from "@/components/create-user-dialog";
import { EditUserDialog } from "@/components/edit-user-dialog";

interface User {
  id: string;
  username: string | null;
  employeeId: string | null;
  name: string;
  role: string;
  is_active: boolean;
  /** Account still without a password (first-access pending or reset by an admin). */
  pending: boolean;
  lastActivityAt: string | null;
}

export function AdminUserManagement({
  data,
  isLoading,
}: {
  data: User[] | undefined;
  isLoading: boolean;
}) {
  const qc = useQueryClient();

  const [editTarget, setEditTarget] = useState<User | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<(typeof PAGE_SIZE_OPTIONS)[number]>(DEFAULT_PAGE_SIZE);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return (data ?? []).filter(
      (u) =>
        (u.username ?? "").toLowerCase().includes(q) ||
        (u.employeeId ?? "").includes(q) ||
        u.name.toLowerCase().includes(q),
    );
  }, [data, search]);

  // A new search/page size can leave the current page out of range (e.g.
  // filtering from 3 pages down to 1); goes back to 1 instead of showing empty.
  useResetOnChange([search, pageSize], () => setPage(1));

  const totalRows = filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
  const pageClamped = Math.min(page, totalPages);
  const paged = useMemo(
    () => filtered.slice((pageClamped - 1) * pageSize, pageClamped * pageSize),
    [filtered, pageClamped, pageSize],
  );

  return (
    <div className="kpi-card p-0">
      <div className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="relative grow max-w-xs">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Buscar por usuário, matrícula ou nome…"
            aria-label="Buscar por usuário, matrícula ou nome"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2">
          <Select
            value={String(pageSize)}
            onValueChange={(v) => setPageSize(Number(v) as (typeof PAGE_SIZE_OPTIONS)[number])}
          >
            <SelectTrigger className="h-9 w-[110px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAGE_SIZE_OPTIONS.map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {n} / página
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <CreateUserDialog onCreated={() => qc.invalidateQueries({ queryKey: ["admin-users"] })} />
        </div>
      </div>

      <div className="overflow-x-auto border-t">
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
                <th className="px-4 py-3">Nome</th>
                <th className="px-4 py-3">Matrícula</th>
                <th className="px-4 py-3">Usuário</th>
                <th className="px-4 py-3">Último acesso</th>
                <th className="px-4 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {paged.map((u) => (
                <tr key={u.id} className="border-b border-border/60">
                  <td className="px-4 py-3 font-medium">
                    <div className="flex items-center gap-2">
                      {u.name}
                      {u.pending && (
                        <span className="inline-block rounded-full bg-warning/15 px-2 py-0.5 text-[10px] font-medium whitespace-nowrap text-warning">
                          Primeiro acesso pendente
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">
                    {u.employeeId ?? <span className="text-muted-foreground">-</span>}
                  </td>
                  <td className="px-4 py-3 font-medium">
                    {u.username ?? <span className="text-muted-foreground">-</span>}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {u.lastActivityAt ? fmtDT(u.lastActivityAt) : "-"}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end">
                      <Button
                        size="sm"
                        variant="outline"
                        title={`Editar ${u.name}`}
                        aria-label={`Editar ${u.name}`}
                        onClick={() => setEditTarget(u)}
                      >
                        <Pencil className="size-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && !isLoading && (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
                    {search ? "Nenhum usuário encontrado." : "Nenhum usuário cadastrado."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {!isLoading && totalRows > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t p-4 text-xs text-muted-foreground">
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

      <EditUserDialog
        target={editTarget}
        onClose={() => setEditTarget(null)}
        onSaved={() => qc.invalidateQueries({ queryKey: ["admin-users"] })}
      />
    </div>
  );
}
