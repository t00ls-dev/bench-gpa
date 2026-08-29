import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  Clock,
  FolderOpen,
  Loader2,
  Package,
  Pencil,
  Plus,
  QrCode,
  Store,
  Trash2,
} from "lucide-react";
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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  SavedAreaAnalysisDialog,
  type SavedAreaStoreOption,
} from "@/components/saved-area-analysis-dialog";
import { SavedAreaQrCodeDialog } from "@/components/saved-area-qr-code-dialog";
import {
  deleteSavedAreaAnalysis,
  getSavedAreaAnalysis,
  listSavedAreaAnalyses,
  type SavedAreaAnalysis,
  type SavedAreaAnalysisSummary,
} from "@/lib/saved-area-analyses.functions";
import { QUERY_STALE_CORE } from "@/lib/query-config";
import type { HierarchyItem } from "@/lib/filter-cascade";

function formatUpdatedAt(value: string): string {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(
    new Date(value),
  );
}

export function SavedAreaAnalysesManager({
  currentUserId,
  hierarchy,
  stores,
  currentStoreCode,
  currentProductCodes,
  currentAnalysis,
}: {
  currentUserId: string;
  hierarchy: HierarchyItem[];
  stores: SavedAreaStoreOption[];
  currentStoreCode?: string;
  currentProductCodes: string[];
  currentAnalysis?: SavedAreaAnalysis;
}) {
  const listAnalyses = useServerFn(listSavedAreaAnalyses);
  const getAnalysis = useServerFn(getSavedAreaAnalysis);
  const deleteAnalysis = useServerFn(deleteSavedAreaAnalysis);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [editAnalysis, setEditAnalysis] = useState<SavedAreaAnalysis | null>(null);
  const [loadingAnalysisId, setLoadingAnalysisId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SavedAreaAnalysisSummary | null>(null);
  const [qrCodeTarget, setQrCodeTarget] = useState<Pick<
    SavedAreaAnalysisSummary,
    "id" | "name" | "storeCode" | "storeName"
  > | null>(null);
  const [deleting, setDeleting] = useState(false);
  const analysesQuery = useQuery({
    queryKey: ["saved-area-analyses", currentUserId],
    queryFn: () => listAnalyses({}),
    enabled: drawerOpen,
    staleTime: QUERY_STALE_CORE,
  });

  const openEdit = async (summary?: SavedAreaAnalysisSummary) => {
    if (!summary && currentAnalysis) {
      if (currentAnalysis.ownerUserId !== currentUserId) return;
      setEditAnalysis(currentAnalysis);
      return;
    }
    if (!summary || loadingAnalysisId) return;
    setLoadingAnalysisId(summary.id);
    try {
      const analysis = await queryClient.fetchQuery({
        queryKey: ["saved-area-analysis", currentUserId, summary.id],
        queryFn: () => getAnalysis({ data: { id: summary.id } }),
        staleTime: QUERY_STALE_CORE,
      });
      setEditAnalysis(analysis);
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Erro ao abrir a análise.");
    } finally {
      setLoadingAnalysisId(null);
    }
  };

  const invalidateAnalysis = async (id: string) => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["saved-area-analyses", currentUserId] }),
      queryClient.invalidateQueries({ queryKey: ["saved-area-analysis", currentUserId, id] }),
    ]);
  };

  const handleCreated = async (id: string) => {
    await invalidateAnalysis(id);
    setCreateOpen(false);
    setDrawerOpen(false);
    await navigate({ to: "/area/$analysisId", params: { analysisId: id } });
  };

  const handleUpdated = async (id: string) => {
    await invalidateAnalysis(id);
    setEditAnalysis(null);
  };

  const confirmDelete = async () => {
    if (!deleteTarget || deleting) return;
    const target = deleteTarget;
    setDeleting(true);
    try {
      await deleteAnalysis({ data: { id: target.id } });
      queryClient.removeQueries({
        queryKey: ["saved-area-analysis", currentUserId, target.id],
      });
      await queryClient.invalidateQueries({ queryKey: ["saved-area-analyses", currentUserId] });
      toast.success("Análise excluída.");
      setDeleteTarget(null);
      if (currentAnalysis?.id === target.id) {
        setDrawerOpen(false);
        await navigate({
          to: "/area",
          search: {
            store: undefined,
            depto: undefined,
            secao: undefined,
            grupo: undefined,
            subgrupo: undefined,
          },
        });
      }
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Erro ao excluir a análise.");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <div className="flex shrink-0 flex-wrap gap-2">
        {!currentAnalysis ? (
          <Button variant="outline" onClick={() => setCreateOpen(true)}>
            <Plus className="mr-2 size-4" /> Salvar análise
          </Button>
        ) : null}
        <Button onClick={() => setDrawerOpen(true)}>
          <FolderOpen className="mr-2 size-4" /> Análises salvas
        </Button>
      </div>

      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent
          className="flex flex-col p-0"
          style={{ width: "min(100vw, 28rem)", maxWidth: "none" }}
        >
          <SheetHeader className="min-w-0 border-b p-6 pr-12">
            <SheetTitle>Análises salvas</SheetTitle>
            <SheetDescription>Composições privadas vinculadas à sua conta.</SheetDescription>
          </SheetHeader>
          <div className="border-b p-4">
            <Button className="w-full" onClick={() => setCreateOpen(true)}>
              <Plus className="mr-2 size-4" /> Nova análise
            </Button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            {analysesQuery.isLoading ? (
              <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" /> Carregando análises…
              </div>
            ) : analysesQuery.isError ? (
              <div className="py-10 text-center">
                <p className="mb-3 text-sm text-destructive">
                  Não foi possível carregar as análises.
                </p>
                <Button variant="outline" size="sm" onClick={() => analysesQuery.refetch()}>
                  Tentar novamente
                </Button>
              </div>
            ) : analysesQuery.data?.length ? (
              <div className="space-y-3">
                {analysesQuery.data.map((analysis) => (
                  <article
                    key={analysis.id}
                    className="min-w-0 overflow-hidden rounded-lg border bg-card p-4 shadow-sm"
                  >
                    <button
                      type="button"
                      className="w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      onClick={async () => {
                        setDrawerOpen(false);
                        await navigate({
                          to: "/area/$analysisId",
                          params: { analysisId: analysis.id },
                        });
                      }}
                    >
                      <h3 className="truncate font-medium" title={analysis.name}>
                        {analysis.name}
                      </h3>
                      <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
                        <Store className="size-3.5 shrink-0" aria-hidden="true" />
                        <span className="truncate">
                          Loja {analysis.storeCode}
                          {analysis.storeName ? ` - ${analysis.storeName}` : ""}
                        </span>
                      </p>
                      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1.5">
                          <Package className="size-3.5 shrink-0" aria-hidden="true" />
                          {analysis.productCount} produto(s)
                        </span>
                        <span className="flex items-center gap-1.5">
                          <Clock className="size-3.5 shrink-0" aria-hidden="true" />
                          Atualizada em {formatUpdatedAt(analysis.updatedAt)}
                        </span>
                      </div>
                    </button>
                    <div className="mt-3 flex justify-end gap-1 border-t pt-3">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setQrCodeTarget(analysis)}
                        aria-label={`Gerar QR Code para ${analysis.name}`}
                      >
                        <QrCode className="size-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => openEdit(analysis)}
                        disabled={loadingAnalysisId !== null}
                        aria-label={`Editar ${analysis.name}`}
                      >
                        {loadingAnalysisId === analysis.id ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <Pencil className="size-4" />
                        )}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive"
                        onClick={() => setDeleteTarget(analysis)}
                        aria-label={`Excluir ${analysis.name}`}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="py-10 text-center">
                <FolderOpen className="mx-auto mb-3 size-8 text-muted-foreground" />
                <p className="font-medium">Nenhuma análise salva</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Crie uma composição para acessá-la novamente por uma URL permanente.
                </p>
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {createOpen ? (
        <SavedAreaAnalysisDialog
          key={`create:${currentStoreCode ?? ""}:${currentProductCodes.join("\0")}`}
          open
          stores={stores}
          hierarchy={hierarchy}
          initialStoreCode={currentStoreCode}
          initialProductCodes={currentProductCodes}
          onOpenChange={setCreateOpen}
          onSaved={handleCreated}
        />
      ) : null}

      {editAnalysis ? (
        <SavedAreaAnalysisDialog
          key={`edit:${editAnalysis.id}:${editAnalysis.updatedAt}`}
          open
          analysis={editAnalysis}
          stores={stores}
          hierarchy={hierarchy}
          onOpenChange={(open) => !open && setEditAnalysis(null)}
          onSaved={handleUpdated}
        />
      ) : null}

      {qrCodeTarget ? (
        <SavedAreaQrCodeDialog
          analysis={qrCodeTarget}
          open
          onOpenChange={(open) => !open && setQrCodeTarget(null)}
        />
      ) : null}

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && !deleting && setDeleteTarget(null)}
      >
        {deleteTarget ? (
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Excluir análise salva?</AlertDialogTitle>
              <AlertDialogDescription>
                A análise “{deleteTarget.name}” e sua composição serão excluídas permanentemente.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={(event) => {
                  event.preventDefault();
                  void confirmDelete();
                }}
                disabled={deleting}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {deleting ? <Loader2 className="size-4 animate-spin" /> : "Excluir"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        ) : null}
      </AlertDialog>
    </>
  );
}
