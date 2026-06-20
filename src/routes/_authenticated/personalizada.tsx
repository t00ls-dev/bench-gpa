import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  listCustomAnalyses, createCustomAnalysis, renameCustomAnalysis,
  deleteCustomAnalysis, duplicateCustomAnalysis,
} from "@/lib/custom-analyses.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription,
  AlertDialogFooter, AlertDialogCancel, AlertDialogAction, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Bookmark, Plus, Pencil, Copy, Trash2, ChevronLeft, Loader2, Star, StarOff } from "lucide-react";
import { toast } from "sonner";
import { fmtBRShort } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/personalizada")({
  component: PersonalizadaListPage,
});

const FAV_KEY = "bench-gpa:custom-analyses:favs";
const RECENT_KEY = "bench-gpa:custom-analyses:recent";

function useLocalSet(key: string) {
  const [set, setSet] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    try { return new Set(JSON.parse(localStorage.getItem(key) ?? "[]")); }
    catch { return new Set(); }
  });
  const persist = (s: Set<string>) => {
    setSet(s);
    localStorage.setItem(key, JSON.stringify([...s]));
  };
  return { set, toggle: (id: string) => { const s = new Set(set); s.has(id) ? s.delete(id) : s.add(id); persist(s); } };
}

function PersonalizadaListPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const list = useServerFn(listCustomAnalyses);
  const create = useServerFn(createCustomAnalysis);
  const rename = useServerFn(renameCustomAnalysis);
  const del = useServerFn(deleteCustomAnalysis);
  const dup = useServerFn(duplicateCustomAnalysis);

  const favs = useLocalSet(FAV_KEY);
  const recents = typeof window !== "undefined"
    ? (JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]") as string[])
    : [];

  const { data, isLoading } = useQuery({
    queryKey: ["custom-analyses"],
    queryFn: () => list(),
    staleTime: 30_000,
  });

  const [name, setName] = useState("");
  const [openNew, setOpenNew] = useState(false);
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);

  const refresh = () => qc.invalidateQueries({ queryKey: ["custom-analyses"] });

  const handleCreate = async () => {
    if (!name.trim()) return;
    try {
      const { id } = await create({ data: { name: name.trim() } });
      setName(""); setOpenNew(false);
      toast.success("Análise criada.");
      navigate({ to: "/personalizada/$id", params: { id } });
    } catch (e: any) { toast.error(e?.message ?? "Erro"); }
  };

  const handleRename = async () => {
    if (!renaming) return;
    try {
      await rename({ data: { id: renaming.id, name: renaming.name.trim() } });
      setRenaming(null); refresh(); toast.success("Renomeada.");
    } catch (e: any) { toast.error(e?.message ?? "Erro"); }
  };

  const handleDelete = async (id: string) => {
    try { await del({ data: { id } }); refresh(); toast.success("Excluída."); }
    catch (e: any) { toast.error(e?.message ?? "Erro"); }
  };

  const handleDuplicate = async (id: string) => {
    try {
      const { id: newId } = await dup({ data: { id } });
      refresh(); toast.success("Duplicada.");
      navigate({ to: "/personalizada/$id", params: { id: newId } });
    } catch (e: any) { toast.error(e?.message ?? "Erro"); }
  };

  const sorted = useMemo(() => {
    const arr = data ?? [];
    return [...arr].sort((a, b) => {
      const af = favs.set.has(a.id) ? 1 : 0;
      const bf = favs.set.has(b.id) ? 1 : 0;
      if (af !== bf) return bf - af;
      return b.updated_at.localeCompare(a.updated_at);
    });
  }, [data, favs.set]);

  const recentItems = (data ?? []).filter((a) => recents.includes(a.id))
    .sort((a, b) => recents.indexOf(a.id) - recents.indexOf(b.id))
    .slice(0, 5);

  return (
    <div>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-xs text-muted-foreground">
            <Link to="/area" className="hover:underline inline-flex items-center gap-1">
              <ChevronLeft className="size-3" /> Análise de Área
            </Link>
          </div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold flex items-center gap-2 mt-1">
            <Bookmark className="size-7 text-primary" /> Análises Personalizadas
          </h1>
          <p className="text-sm text-muted-foreground">
            Listas próprias de PLUs para análise sob medida (visíveis apenas para você).
          </p>
        </div>
        <Dialog open={openNew} onOpenChange={setOpenNew}>
          <DialogTrigger asChild>
            <Button><Plus className="mr-2 size-4" /> Nova Análise Personalizada</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Nova análise personalizada</DialogTitle></DialogHeader>
            <div className="space-y-2">
              <Label>Nome</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)}
                placeholder="Ex.: Curva de itens estratégicos"
                onKeyDown={(e) => e.key === "Enter" && handleCreate()} autoFocus />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpenNew(false)}>Cancelar</Button>
              <Button onClick={handleCreate} disabled={!name.trim()}>Criar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </header>

      {recentItems.length > 0 && (
        <section className="kpi-card mb-4">
          <h2 className="font-display text-sm font-semibold text-muted-foreground uppercase tracking-wide">Acessadas recentemente</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {recentItems.map((a) => (
              <Link key={a.id} to="/personalizada/$id" params={{ id: a.id }}
                className="rounded-full border border-border bg-background px-3 py-1.5 text-xs font-medium hover:border-primary/50 hover:text-primary">
                {a.name}
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="kpi-card">
        {isLoading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <Loader2 className="mr-2 size-4 animate-spin" /> Carregando…
          </div>
        ) : sorted.length === 0 ? (
          <div className="py-12 text-center text-muted-foreground">
            <p>Você ainda não criou nenhuma análise personalizada.</p>
            <Button className="mt-4" onClick={() => setOpenNew(true)}>
              <Plus className="mr-2 size-4" /> Criar a primeira
            </Button>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="py-2 pr-3 w-10"></th>
                <th className="py-2 pr-3">Nome</th>
                <th className="py-2 px-3 text-right whitespace-nowrap">Produtos</th>
                <th className="py-2 px-3 text-right whitespace-nowrap">Última atualização</th>
                <th className="py-2 pl-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((a) => {
                const isFav = favs.set.has(a.id);
                return (
                  <tr key={a.id} className="border-b border-border/60 hover:bg-muted/40">
                    <td className="py-2 pr-3">
                      <button onClick={() => favs.toggle(a.id)} title={isFav ? "Desfavoritar" : "Favoritar"}>
                        {isFav ? <Star className="size-4 fill-amber-400 text-amber-500" /> : <StarOff className="size-4 text-muted-foreground" />}
                      </button>
                    </td>
                    <td className="py-2 pr-3">
                      <Link to="/personalizada/$id" params={{ id: a.id }} className="font-medium hover:text-primary">
                        {a.name}
                      </Link>
                    </td>
                    <td className="num py-2 px-3 text-right whitespace-nowrap">{a.itemCount}</td>
                    <td className="num py-2 px-3 text-right whitespace-nowrap text-muted-foreground text-xs">
                      {fmtBRShort(new Date(a.updated_at))}
                    </td>
                    <td className="py-2 pl-3">
                      <div className="flex justify-end gap-1.5">
                        <Button size="sm" variant="outline" onClick={() => setRenaming({ id: a.id, name: a.name })} title="Renomear">
                          <Pencil className="size-3.5" />
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => handleDuplicate(a.id)} title="Duplicar">
                          <Copy className="size-3.5" />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button size="sm" variant="outline" title="Excluir">
                              <Trash2 className="size-3.5 text-destructive" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Excluir análise?</AlertDialogTitle>
                              <AlertDialogDescription>
                                Esta ação é irreversível. A análise "{a.name}" e todos os seus produtos vinculados serão removidos permanentemente.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancelar</AlertDialogCancel>
                              <AlertDialogAction onClick={() => handleDelete(a.id)}>Excluir</AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      <Dialog open={!!renaming} onOpenChange={(o) => !o && setRenaming(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Renomear análise</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <Label>Nome</Label>
            <Input value={renaming?.name ?? ""} onChange={(e) => setRenaming(renaming ? { ...renaming, name: e.target.value } : null)}
              onKeyDown={(e) => e.key === "Enter" && handleRename()} autoFocus />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenaming(null)}>Cancelar</Button>
            <Button onClick={handleRename} disabled={!renaming?.name.trim()}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function pushRecent(id: string) {
  if (typeof window === "undefined") return;
  try {
    const arr = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]") as string[];
    const next = [id, ...arr.filter((x) => x !== id)].slice(0, 10);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch { /* noop */ }
}

// suppress unused warning
void useEffect;
