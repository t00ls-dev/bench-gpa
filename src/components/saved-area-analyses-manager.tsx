import { lazy, Suspense, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  Clock,
  History,
  FolderOpen,
  Loader2,
  Package,
  Pencil,
  Plus,
  QrCode,
  Store,
  Trash2,
  UserRoundCog,
  X,
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
  listRecentSavedAreaAnalyses,
  listSavedAreaAnalyses,
  type SavedAreaAnalysis,
  type SavedAreaAnalysisSummary,
} from "@/lib/saved-area-analyses.functions";
import { QUERY_STALE_CORE } from "@/lib/query-config";
import type { HierarchyItem } from "@/lib/filter-cascade";
import { hasAdminRole } from "@/lib/roles";
import {
  clearRecentSavedAreas,
  getBrowserLocalStorage,
  readRecentSavedAreas,
  removeRecentSavedArea,
  type RecentSavedAreaVisit,
} from "@/lib/recent-saved-areas";

const AdminSavedAreaTransferDialog = lazy(() =>
  import("@/components/admin-saved-area-transfer-dialog").then((module) => ({
    default: module.AdminSavedAreaTransferDialog,
  })),
);

function formatUpdatedAt(value: string): string {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(
    new Date(value),
  );
}

export function SavedAreaAnalysesManager({
  currentUserId,
  currentUserRole,
  hierarchy,
  stores,
  currentStoreCode,
  currentProductCodes,
  currentAnalysis,
}: {
  currentUserId: string;
  currentUserRole: string;
  hierarchy: HierarchyItem[];
  stores: SavedAreaStoreOption[];
  currentStoreCode?: string;
  currentProductCodes: string[];
  currentAnalysis?: SavedAreaAnalysis;
}) {
  const listAnalyses = useServerFn(listSavedAreaAnalyses);
  const listRecentAnalyses = useServerFn(listRecentSavedAreaAnalyses);
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
  const [transferOpen, setTransferOpen] = useState(false);
  const [recentVisits, setRecentVisits] = useState<RecentSavedAreaVisit[]>([]);
  const recentIds = recentVisits.map((visit) => visit.analysisId);
  const isAdmin = hasAdminRole(currentUserRole);
  const analysesQuery = useQuery({
    queryKey: ["saved-area-analyses", currentUserId],
    queryFn: () => listAnalyses({}),
    enabled: drawerOpen,
    staleTime: QUERY_STALE_CORE,
  });
  const recentAnalysesQuery = useQuery({
    queryKey: ["recent-saved-area-analyses", currentUserId, recentIds],
    queryFn: async () => {
      const analyses = await listRecentAnalyses({ data: { ids: recentIds } });
      const availableIds = new Set(analyses.map((analysis) => analysis.id));
      const storage = getBrowserLocalStorage();
      if (storage) {
        for (const analysisId of recentIds) {
          if (!availableIds.has(analysisId)) {
            removeRecentSavedArea(storage, currentUserId, analysisId);
          }
        }
      }
      return analyses;
    },
    enabled: drawerOpen && recentIds.length > 0,
    staleTime: QUERY_STALE_CORE,
  });

  const changeDrawerOpen = (open: boolean) => {
    setDrawerOpen(open);
    if (!open) return;
    const storage = getBrowserLocalStorage();
    setRecentVisits(storage ? readRecentSavedAreas(storage, currentUserId) : []);
  };

  const removeRecent = (analysisId: string) => {
    const storage = getBrowserLocalStorage();
    if (!storage) return;
    setRecentVisits(removeRecentSavedArea(storage, currentUserId, analysisId));
  };

  const clearRecent = () => {
    const storage = getBrowserLocalStorage();
    if (!storage) return;
    clearRecentSavedAreas(storage, currentUserId);
    setRecentVisits([]);
  };

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
      removeRecent(target.id);
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
        <Button onClick={() => changeDrawerOpen(true)}>
          <FolderOpen className="mr-2 size-4" /> Análises salvas
        </Button>
        {currentAnalysis && isAdmin ? (
          <Button variant="outline" onClick={() => setTransferOpen(true)}>
            <UserRoundCog className="mr-2 size-4" /> Transferir
          </Button>
        ) : null}
      </div>

      <Sheet open={drawerOpen} onOpenChange={changeDrawerOpen}>
        <SheetContent
          className="flex flex-col p-0"
          style={{ width: "min(100vw, 28rem)", maxWidth: "none" }}
        >
          <SheetHeader className="min-w-0 border-b p-6 pr-12">
            <SheetTitle>Análises salvas</SheetTitle>
            <SheetDescription>
              Acesse áreas recentes ou gerencie as composições criadas por você.
            </SheetDescription>
          </SheetHeader>
          <div className="border-b p-4">
            <Button className="w-full" onClick={() => setCreateOpen(true)}>
              <Plus className="mr-2 size-4" /> Nova análise
            </Button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            <section className="mb-6" aria-labelledby="recent-saved-areas-heading">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h3
                  id="recent-saved-areas-heading"
                  className="flex items-center gap-2 text-sm font-semibold"
                >
                  <History className="size-4 text-muted-foreground" /> Recentemente visitadas
                </h3>
                {recentVisits.length > 0 ? (
                  <Button variant="ghost" size="sm" onClick={clearRecent}>
                    Limpar
                  </Button>
                ) : null}
              </div>
              {recentVisits.length === 0 ? (
                <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
                  As áreas abertas neste dispositivo aparecerão aqui por até 30 dias.
                </p>
              ) : recentAnalysesQuery.isLoading ? (
                <div className="flex items-center justify-center gap-2 py-5 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" /> Carregando áreas recentes…
                </div>
              ) : recentAnalysesQuery.isError ? (
                <div className="rounded-lg border border-destructive/40 p-3">
                  <p className="text-sm text-destructive">Não foi possível carregar as recentes.</p>
                  <Button
                    className="mt-2"
                    variant="outline"
                    size="sm"
                    onClick={() => recentAnalysesQuery.refetch()}
                  >
                    Tentar novamente
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  {recentAnalysesQuery.data?.map((analysis) => {
                    const visit = recentVisits.find((item) => item.analysisId === analysis.id);
                    return (
                      <article
                        key={analysis.id}
                        className="flex min-w-0 items-start gap-2 rounded-lg border bg-card p-3"
                      >
                        <button
                          type="button"
                          className="min-w-0 flex-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          onClick={async () => {
                            changeDrawerOpen(false);
                            await navigate({
                              to: "/area/$analysisId",
                              params: { analysisId: analysis.id },
                            });
                          }}
                        >
                          <span className="block truncate text-sm font-medium">
                            {analysis.name}
                          </span>
                          <span className="mt-1 block truncate text-xs text-muted-foreground">
                            Loja {analysis.storeCode}
                            {analysis.storeName ? ` - ${analysis.storeName}` : ""}
                          </span>
                          {visit ? (
                            <span className="mt-1 block text-xs text-muted-foreground">
                              Visitada em {formatUpdatedAt(visit.visitedAt)}
                            </span>
                          ) : null}
                        </button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8 shrink-0"
                          onClick={() => removeRecent(analysis.id)}
                          aria-label={`Remover ${analysis.name} das áreas recentes`}
                        >
                          <X className="size-4" />
                        </Button>
                      </article>
                    );
                  })}
                </div>
              )}
            </section>

            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
              <FolderOpen className="size-4 text-muted-foreground" /> Criadas por mim
            </h3>
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

      {currentAnalysis && transferOpen ? (
        <Suspense fallback={null}>
          <AdminSavedAreaTransferDialog
            analysis={currentAnalysis}
            open
            onOpenChange={setTransferOpen}
            onTransferred={() =>
              queryClient.invalidateQueries({
                queryKey: ["saved-area-analysis", currentUserId, currentAnalysis.id],
              })
            }
          />
        </Suspense>
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
