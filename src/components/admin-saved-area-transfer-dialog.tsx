import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { listUsers } from "@/lib/admin-users.functions";
import {
  transferSavedAreaAnalysis,
  type SavedAreaAnalysis,
} from "@/lib/saved-area-analyses.functions";
import { QUERY_STALE_CORE } from "@/lib/query-config";

export function AdminSavedAreaTransferDialog({
  analysis,
  open,
  onOpenChange,
  onTransferred,
}: {
  analysis: Pick<SavedAreaAnalysis, "id" | "name" | "ownerUserId" | "ownerName" | "ownerUsername">;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onTransferred: () => void | Promise<void>;
}) {
  const getUsers = useServerFn(listUsers);
  const transferAnalysis = useServerFn(transferSavedAreaAnalysis);
  const queryClient = useQueryClient();
  const [targetUserId, setTargetUserId] = useState("");
  const [transferring, setTransferring] = useState(false);
  const usersQuery = useQuery({
    queryKey: ["admin-users"],
    queryFn: () => getUsers({}),
    enabled: open,
    staleTime: QUERY_STALE_CORE,
  });
  const eligibleUsers = (usersQuery.data ?? []).filter(
    (user) => user.is_active && !user.pending && user.id !== analysis.ownerUserId,
  );
  const selectedUser = eligibleUsers.find((user) => user.id === targetUserId);

  const submit = async () => {
    if (!targetUserId || transferring) return;
    setTransferring(true);
    try {
      await transferAnalysis({ data: { analysisId: analysis.id, targetUserId } });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["saved-area-analyses"] }),
        queryClient.invalidateQueries({ queryKey: ["saved-area-analysis"] }),
      ]);
      toast.success("Propriedade transferida.");
      await onTransferred();
      onOpenChange(false);
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Erro ao transferir a análise.");
    } finally {
      setTransferring(false);
    }
  };

  return (
    <AlertDialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (transferring) return;
        if (!nextOpen) setTargetUserId("");
        onOpenChange(nextOpen);
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Transferir propriedade?</AlertDialogTitle>
          <AlertDialogDescription>
            Transfira “{analysis.name}”, atualmente de{" "}
            {analysis.ownerName ?? analysis.ownerUsername ?? analysis.ownerUserId}. O proprietário
            atual perderá as permissões de edição e exclusão, mas a URL e o QR Code continuarão
            iguais.
          </AlertDialogDescription>
        </AlertDialogHeader>

        {usersQuery.isLoading ? (
          <div className="flex items-center justify-center gap-2 py-4 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Carregando usuários…
          </div>
        ) : usersQuery.isError ? (
          <p className="text-sm text-destructive">Não foi possível carregar os usuários.</p>
        ) : eligibleUsers.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Não há outro usuário ativo com primeiro acesso concluído.
          </p>
        ) : (
          <Select value={targetUserId || undefined} onValueChange={setTargetUserId}>
            <SelectTrigger aria-label="Novo proprietário">
              <SelectValue placeholder="Selecione o novo proprietário" />
            </SelectTrigger>
            <SelectContent>
              {eligibleUsers.map((user) => (
                <SelectItem key={user.id} value={user.id}>
                  {user.name} · {user.username ?? user.employeeId}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {selectedUser ? (
          <p className="text-sm text-muted-foreground">
            Novo proprietário: <strong className="text-foreground">{selectedUser.name}</strong>
          </p>
        ) : null}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={transferring}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            disabled={!targetUserId || transferring || usersQuery.isError}
            onClick={(event) => {
              event.preventDefault();
              void submit();
            }}
          >
            {transferring ? <Loader2 className="size-4 animate-spin" /> : "Transferir"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
