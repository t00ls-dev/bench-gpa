import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Search, UserRound, X } from "lucide-react";
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { searchSavedAreaRecipients, type SavedAreaRecipient } from "@/lib/admin-users.functions";
import {
  transferSavedAreaAnalysis,
  type SavedAreaAnalysis,
} from "@/lib/saved-area-analyses.functions";

const SEARCH_DEBOUNCE_MS = 250;

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
  const searchRecipients = useServerFn(searchSavedAreaRecipients);
  const transferAnalysis = useServerFn(transferSavedAreaAnalysis);
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [selectedUser, setSelectedUser] = useState<SavedAreaRecipient | null>(null);
  const [activeResultIndex, setActiveResultIndex] = useState(-1);
  const [transferring, setTransferring] = useState(false);
  const normalizedQuery = query.trim();
  const searchReady = normalizedQuery.length >= 3 && normalizedQuery === debouncedQuery;

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedQuery(query.trim()), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timeout);
  }, [query]);

  const recipientsQuery = useQuery({
    queryKey: ["saved-area-recipient-search", analysis.id, debouncedQuery],
    queryFn: () => searchRecipients({ data: { analysisId: analysis.id, q: debouncedQuery } }),
    enabled: open && searchReady && !selectedUser,
  });
  const visibleRecipients =
    searchReady && !recipientsQuery.isFetching && !recipientsQuery.isError
      ? (recipientsQuery.data ?? [])
      : [];
  const activeResult = visibleRecipients[activeResultIndex];

  const resetSelection = () => {
    setQuery("");
    setDebouncedQuery("");
    setSelectedUser(null);
    setActiveResultIndex(-1);
  };

  const selectUser = (user: SavedAreaRecipient) => {
    setSelectedUser(user);
    setQuery("");
    setDebouncedQuery("");
    setActiveResultIndex(-1);
  };

  const submit = async () => {
    if (!selectedUser || transferring) return;
    setTransferring(true);
    try {
      await transferAnalysis({ data: { analysisId: analysis.id, targetUserId: selectedUser.id } });
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
        if (!nextOpen) resetSelection();
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

        {selectedUser ? (
          <div className="flex items-center justify-between gap-3 rounded-md border bg-muted/40 p-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{selectedUser.name}</p>
              <p className="truncate text-xs text-muted-foreground">
                {[selectedUser.employeeId, selectedUser.username].filter(Boolean).join(" · ")}
              </p>
            </div>
            <Button type="button" variant="ghost" size="sm" onClick={resetSelection}>
              Trocar usuário
            </Button>
          </div>
        ) : (
          <div className="relative">
            <div className="flex items-center gap-2 rounded-md border px-3 focus-within:ring-1 focus-within:ring-ring">
              <Search className="size-4 shrink-0 text-muted-foreground" />
              <Input
                aria-label="Buscar novo proprietário"
                aria-autocomplete="list"
                aria-controls={
                  normalizedQuery.length >= 3 ? "saved-area-recipient-results" : undefined
                }
                aria-activedescendant={
                  activeResult ? `saved-area-recipient-${activeResult.id}` : undefined
                }
                aria-expanded={normalizedQuery.length >= 3}
                className="border-0 px-0 shadow-none focus-visible:ring-0"
                maxLength={120}
                placeholder="Nome, matrícula ou username"
                value={query}
                role="combobox"
                onChange={(event) => {
                  setQuery(event.target.value);
                  setActiveResultIndex(-1);
                }}
                onKeyDown={(event) => {
                  const results = visibleRecipients;
                  if (event.key === "ArrowDown" && results.length > 0) {
                    event.preventDefault();
                    setActiveResultIndex((current) => (current + 1) % results.length);
                  } else if (event.key === "ArrowUp" && results.length > 0) {
                    event.preventDefault();
                    setActiveResultIndex((current) =>
                      current <= 0 ? results.length - 1 : current - 1,
                    );
                  } else if (event.key === "Enter" && activeResultIndex >= 0) {
                    event.preventDefault();
                    const user = results[activeResultIndex];
                    if (user) selectUser(user);
                  } else if (event.key === "Escape" && query) {
                    event.preventDefault();
                    resetSelection();
                  }
                }}
              />
              {query ? (
                <button
                  type="button"
                  aria-label="Limpar busca"
                  className="text-muted-foreground hover:text-foreground"
                  onClick={resetSelection}
                >
                  <X className="size-4" />
                </button>
              ) : null}
            </div>

            {normalizedQuery.length >= 3 ? (
              <div
                id="saved-area-recipient-results"
                role="listbox"
                aria-label="Usuários encontrados"
                className="mt-1 max-h-60 overflow-y-auto rounded-md border bg-popover shadow-sm"
              >
                {!searchReady || recipientsQuery.isFetching ? (
                  <div
                    role="status"
                    className="flex items-center justify-center gap-2 p-4 text-sm text-muted-foreground"
                  >
                    <Loader2 className="size-4 animate-spin" /> Buscando…
                  </div>
                ) : recipientsQuery.isError ? (
                  <p className="p-3 text-sm text-destructive">Não foi possível buscar usuários.</p>
                ) : visibleRecipients.length ? (
                  <ul role="presentation">
                    {visibleRecipients.map((user, index) => (
                      <li key={user.id} role="presentation">
                        <button
                          id={`saved-area-recipient-${user.id}`}
                          type="button"
                          role="option"
                          aria-selected={index === activeResultIndex}
                          className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-muted aria-selected:bg-muted"
                          onClick={() => selectUser(user)}
                          onMouseEnter={() => setActiveResultIndex(index)}
                        >
                          <UserRound className="size-4 shrink-0 text-muted-foreground" />
                          <span className="min-w-0">
                            <span className="block truncate text-sm">{user.name}</span>
                            <span className="block truncate text-xs text-muted-foreground">
                              {[user.employeeId, user.username].filter(Boolean).join(" · ")}
                            </span>
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="p-3 text-sm text-muted-foreground">
                    Nenhum usuário elegível encontrado.
                  </p>
                )}
              </div>
            ) : query.length > 0 ? (
              <p className="mt-2 text-xs text-muted-foreground">Digite ao menos 3 caracteres.</p>
            ) : null}
          </div>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={transferring}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            disabled={!selectedUser || transferring}
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
