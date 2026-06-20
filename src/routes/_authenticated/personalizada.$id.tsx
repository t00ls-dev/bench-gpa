import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  getCustomAnalysis, addProductToAnalysis, removeProductFromAnalysis,
  renameCustomAnalysis, getCustomAnalysisResults,
} from "@/lib/custom-analyses.functions";
import { getFilterOptions } from "@/lib/analytics.functions";
import { pushRecent } from "./personalizada";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { KpiCard, fmtBRL, fmtInt } from "@/components/kpi-card";
import { DateRangePicker } from "@/components/date-range-picker";
import { usePersistentState } from "@/hooks/use-persistent-state";
import { fmtBRShort } from "@/lib/utils";
import {
  ChevronLeft, Plus, Trash2, Search, Loader2, FileText, AlertTriangle, Pencil, Check,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/personalizada/$id")({
  component: PersonalizadaDetailPage,
});

const ALL = "__all__";

type SortKey = "prod_code" | "prod_name" | "val" | "share";

function escapeHtml(s: string) {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

function PersonalizadaDetailPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();

  useEffect(() => { pushRecent(id); }, [id]);

  const fnGet = useServerFn(getCustomAnalysis);
  const fnAdd = useServerFn(addProductToAnalysis);
  const fnRemove = useServerFn(removeProductFromAnalysis);
  const fnRename = useServerFn(renameCustomAnalysis);
  const fnResults = useServerFn(getCustomAnalysisResults);
  const fnOpts = useServerFn(getFilterOptions);

  const { data: analysis, isLoading } = useQuery({
    queryKey: ["custom-analysis", id],
    queryFn: () => fnGet({ data: { id } }),
  });

  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  useEffect(() => { if (analysis) setNameDraft(analysis.name); }, [analysis?.name]);

  const handleRename = async () => {
    if (!nameDraft.trim()) return;
    try {
      await fnRename({ data: { id, name: nameDraft.trim() } });
      qc.invalidateQueries({ queryKey: ["custom-analysis", id] });
      qc.invalidateQueries({ queryKey: ["custom-analyses"] });
      setEditingName(false); toast.success("Renomeada.");
    } catch (e: any) { toast.error(e?.message ?? "Erro"); }
  };

  const [plu, setPlu] = useState("");
  const [adding, setAdding] = useState(false);
  const handleAdd = async () => {
    const code = plu.trim();
    if (!code) return;
    setAdding(true);
    try {
      const res = await fnAdd({ data: { id, prodCode: code } });
      setPlu(""); qc.invalidateQueries({ queryKey: ["custom-analysis", id] });
      toast.success(`Adicionado: ${res.prod_name}`);
    } catch (e: any) { toast.error(e?.message ?? "Erro"); }
    finally { setAdding(false); }
  };

  const handleRemove = async (prodCode: string) => {
    try {
      await fnRemove({ data: { id, prodCode } });
      qc.invalidateQueries({ queryKey: ["custom-analysis", id] });
    } catch (e: any) { toast.error(e?.message ?? "Erro"); }
  };

  // ===== Resultados (vendas) =====
  type AF = {
    dateFrom: string; dateTo: string;
    store: string; depto: string; secao: string; grupo: string; subgrupo: string;
  };
  const [af, setAf] = usePersistentState<AF>(`bench-gpa:filters:custom:${id}`, {
    dateFrom: "", dateTo: "",
    store: ALL, depto: ALL, secao: ALL, grupo: ALL, subgrupo: ALL,
  });

  const { data: opts } = useQuery({
    queryKey: ["filter-options-custom", af.store, af.depto, af.secao, af.grupo],
    queryFn: () => fnOpts({ data: {
      dateFrom: null, dateTo: null,
      stores: af.store !== ALL ? [af.store] : [],
      deptos: af.depto !== ALL ? [af.depto] : [],
      secoes: af.secao !== ALL ? [af.secao] : [],
      grupos: af.grupo !== ALL ? [af.grupo] : [],
    } }),
    staleTime: 5 * 60_000,
  });

  useEffect(() => {
    if (opts?.latestDate && (!af.dateFrom || !af.dateTo)) {
      const avail = (opts?.availableDates ?? []) as string[];
      const latest = opts.latestDate;
      const w = avail.filter((d) => d <= latest).slice(-7);
      setAf({ ...af, dateFrom: w[0] ?? latest, dateTo: latest });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts?.latestDate]);

  const ready = !!af.dateFrom && !!af.dateTo;

  const { data: results, isFetching } = useQuery({
    queryKey: ["custom-analysis-results", id, af],
    queryFn: () => fnResults({ data: {
      id,
      dateFrom: af.dateFrom, dateTo: af.dateTo,
      stores: af.store !== ALL ? [af.store] : [],
      deptos: af.depto !== ALL ? [af.depto] : [],
      secoes: af.secao !== ALL ? [af.secao] : [],
      grupos: af.grupo !== ALL ? [af.grupo] : [],
      subgrupos: af.subgrupo !== ALL ? [af.subgrupo] : [],
    } }),
    enabled: ready,
  });

  const stores = (opts?.stores ?? []) as { store_code: string; store_name: string }[];
  const deptos = (opts?.deptos ?? []) as string[];
  const secoes = (opts?.secoes ?? []) as string[];
  const grupos = (opts?.grupos ?? []) as string[];
  const subgrupos = (opts?.subgrupos ?? []) as string[];

  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("val");
  const [sortAsc, setSortAsc] = useState(false);

  const total = results?.total ?? 0;
  const enriched = useMemo(() => (results?.products ?? []).map((p) => ({
    ...p, share: total > 0 ? p.val / total : 0,
  })), [results, total]);

  const tableRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = enriched;
    if (q) list = list.filter((p) => p.prod_code.toLowerCase().includes(q) || p.prod_name.toLowerCase().includes(q));
    return [...list].sort((a, b) => {
      let av: number | string = 0, bv: number | string = 0;
      switch (sortKey) {
        case "prod_code": av = a.prod_code; bv = b.prod_code; break;
        case "prod_name": av = a.prod_name; bv = b.prod_name; break;
        case "val": av = a.val; bv = b.val; break;
        case "share": av = a.share; bv = b.share; break;
      }
      if (typeof av === "string") return sortAsc ? (av as string).localeCompare(bv as string) : (bv as string).localeCompare(av as string);
      return sortAsc ? (av as number) - (bv as number) : (bv as number) - (av as number);
    });
  }, [enriched, search, sortKey, sortAsc]);

  const exportPdf = () => {
    if (!analysis) return;
    const win = window.open("", "_blank", "width=900,height=1000");
    if (!win) return;
    const today = new Date().toLocaleDateString("pt-BR");
    const rowsHtml = tableRows.map((p) => `
      <tr>
        <td>${escapeHtml(p.prod_code)}</td>
        <td>${escapeHtml(p.prod_name)}</td>
        <td class="num">${escapeHtml(fmtBRL(p.val))}</td>
        <td class="estoque"></td>
      </tr>`).join("");
    win.document.write(`<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><title>${escapeHtml(analysis.name)}</title>
<style>
  *{box-sizing:border-box;font-family:Arial,Helvetica,sans-serif}
  body{margin:24px;color:#111;font-size:11px}
  h1{font-size:16px;margin:0 0 4px}
  .meta{color:#555;font-size:10px;margin-bottom:12px}
  table{width:100%;border-collapse:collapse}
  th,td{border:1px solid #999;padding:5px 6px;text-align:left}
  th{background:#eef;font-size:10px;text-transform:uppercase}
  td.num{text-align:right;white-space:nowrap}
  td.estoque{width:90px;height:24px}
  @media print{ body{margin:12mm} }
</style></head><body>
<h1>${escapeHtml(analysis.name)}</h1>
<div class="meta">
  <div><strong>Período:</strong> ${escapeHtml(fmtBRShort(af.dateFrom))} a ${escapeHtml(fmtBRShort(af.dateTo))}</div>
  <div><strong>Produtos listados:</strong> ${tableRows.length} &nbsp;·&nbsp; <strong>Emissão:</strong> ${escapeHtml(today)}</div>
</div>
<table>
  <thead><tr><th style="width:90px">PLU</th><th>Produto</th><th style="width:110px;text-align:right">Venda</th><th style="width:120px">Estoque</th></tr></thead>
  <tbody>${rowsHtml || `<tr><td colspan="4" style="text-align:center;padding:24px">Nenhum produto.</td></tr>`}</tbody>
</table>
<script>window.onload=()=>setTimeout(()=>window.print(),250)<\/script>
</body></html>`);
    win.document.close();
  };

  if (isLoading || !analysis) {
    return <div className="flex items-center justify-center py-12 text-muted-foreground"><Loader2 className="mr-2 size-4 animate-spin" /> Carregando…</div>;
  }

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortAsc(!sortAsc);
    else { setSortKey(k); setSortAsc(k === "prod_code" || k === "prod_name"); }
  };

  return (
    <div>
      <header className="mb-6">
        <div className="text-xs text-muted-foreground">
          <Link to="/personalizada" className="hover:underline inline-flex items-center gap-1">
            <ChevronLeft className="size-3" /> Análises Personalizadas
          </Link>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          {editingName ? (
            <>
              <Input value={nameDraft} onChange={(e) => setNameDraft(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleRename()}
                className="text-2xl font-bold h-10 max-w-md" autoFocus />
              <Button size="sm" onClick={handleRename}><Check className="size-4" /></Button>
              <Button size="sm" variant="ghost" onClick={() => { setEditingName(false); setNameDraft(analysis.name); }}>Cancelar</Button>
            </>
          ) : (
            <>
              <h1 className="font-display text-2xl sm:text-3xl font-bold">{analysis.name}</h1>
              <Button size="sm" variant="ghost" onClick={() => setEditingName(true)}><Pencil className="size-3.5" /></Button>
            </>
          )}
          <span className="ml-auto text-xs text-muted-foreground">
            {analysis.items.length} {analysis.items.length === 1 ? "produto" : "produtos"}
          </span>
        </div>
      </header>

      <Tabs defaultValue="produtos">
        <TabsList>
          <TabsTrigger value="produtos">Produtos</TabsTrigger>
          <TabsTrigger value="resultados">Resultados</TabsTrigger>
        </TabsList>

        <TabsContent value="produtos" className="mt-4">
          <div className="kpi-card">
            <div className="flex flex-wrap items-end gap-2 mb-4">
              <div className="flex-1 min-w-[200px]">
                <Label className="text-xs">Adicionar PLU</Label>
                <Input value={plu} onChange={(e) => setPlu(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleAdd()}
                  placeholder="Digite o código do produto" />
              </div>
              <Button onClick={handleAdd} disabled={adding || !plu.trim()}>
                {adding ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Plus className="mr-2 size-4" />}
                Adicionar
              </Button>
            </div>

            <ProductList items={analysis.items} onRemove={handleRemove} />
          </div>
        </TabsContent>

        <TabsContent value="resultados" className="mt-4">
          <div className="kpi-card mb-4">
            <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-6">
              <div>
                <Label className="text-xs">Período</Label>
                <div className="mt-1">
                  <DateRangePicker from={af.dateFrom} to={af.dateTo}
                    reference={opts?.latestDate ?? undefined}
                    availableDates={opts?.availableDates ?? []}
                    onChange={(r) => setAf({ ...af, dateFrom: r.from, dateTo: r.to })} />
                </div>
              </div>
              <div>
                <Label className="text-xs">Loja</Label>
                <Select value={af.store} onValueChange={(v) => setAf({ ...af, store: v, depto: ALL, secao: ALL, grupo: ALL, subgrupo: ALL })}>
                  <SelectTrigger className="mt-1 h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>Todas</SelectItem>
                    {stores.map((s) => <SelectItem key={s.store_code} value={s.store_code}>{s.store_code}: {s.store_name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Departamento</Label>
                <Select value={af.depto} onValueChange={(v) => setAf({ ...af, depto: v, secao: ALL, grupo: ALL, subgrupo: ALL })}>
                  <SelectTrigger className="mt-1 h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>Todos</SelectItem>
                    {deptos.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Seção</Label>
                <Select value={af.secao} onValueChange={(v) => setAf({ ...af, secao: v, grupo: ALL, subgrupo: ALL })}>
                  <SelectTrigger className="mt-1 h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>Todas</SelectItem>
                    {secoes.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Grupo</Label>
                <Select value={af.grupo} onValueChange={(v) => setAf({ ...af, grupo: v, subgrupo: ALL })}>
                  <SelectTrigger className="mt-1 h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>Todos</SelectItem>
                    {grupos.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Subgrupo</Label>
                <Select value={af.subgrupo} onValueChange={(v) => setAf({ ...af, subgrupo: v })}>
                  <SelectTrigger className="mt-1 h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>Todos</SelectItem>
                    {subgrupos.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {!ready ? (
            <div className="kpi-card text-center text-muted-foreground">Selecione um período para ver os resultados.</div>
          ) : (
            <>
              <section className="mb-4 grid gap-4 sm:grid-cols-2 md:grid-cols-4">
                <KpiCard label="Venda Total" value={fmtBRL(total)} />
                <KpiCard label="PLUs na análise" value={fmtInt(results?.plusTotal ?? 0)} />
                <KpiCard label="PLUs com venda" value={fmtInt(results?.plusWithSale ?? 0)} />
                <KpiCard label="PLUs sem venda" value={fmtInt(results?.plusWithoutSale ?? 0)} />
              </section>

              <div className="kpi-card">
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <h2 className="font-display text-lg font-semibold">Produtos</h2>
                  {isFetching && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
                  <div className="ml-auto flex flex-wrap items-center gap-2">
                    <div className="flex items-center gap-1 rounded-md border bg-background px-2 h-9">
                      <Search className="size-3.5 text-muted-foreground" />
                      <Input placeholder="Buscar PLU ou descrição…" value={search} onChange={(e) => setSearch(e.target.value)}
                        className="h-7 w-40 sm:w-56 border-0 px-1 text-sm shadow-none focus-visible:ring-0" />
                    </div>
                    <Button variant="outline" size="sm" onClick={exportPdf} className="h-9">
                      <FileText className="mr-1.5 size-4" /> PDF
                    </Button>
                  </div>
                </div>

                <div className="overflow-x-auto -mx-3 px-3 sm:mx-0 sm:px-0">
                  <table className="min-w-[720px] w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
                        <th className="py-2 cursor-pointer" onClick={() => toggleSort("prod_code")}>PLU</th>
                        <th className="py-2 cursor-pointer" onClick={() => toggleSort("prod_name")}>Descrição</th>
                        <th className="py-2 px-3">Depto</th>
                        <th className="py-2 px-3">Seção</th>
                        <th className="py-2 pl-8 text-right cursor-pointer whitespace-nowrap" onClick={() => toggleSort("val")}>Venda</th>
                        <th className="py-2 pl-8 text-right cursor-pointer whitespace-nowrap" onClick={() => toggleSort("share")}>Part. %</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tableRows.map((p) => {
                        const noSale = p.val === 0;
                        return (
                          <tr key={p.prod_code} onClick={() => navigate({ to: "/produto", search: { plu: p.prod_code } })}
                            className={`cursor-pointer border-b border-border/60 hover:bg-muted/40 ${noSale ? "bg-amber-50/40" : ""}`}>
                            <td className="py-2 font-mono text-xs whitespace-nowrap">
                              {p.prod_code}
                              {!p.exists_in_base && (
                                <span title="PLU não existe mais na base atual" className="ml-1 inline-flex items-center text-amber-600">
                                  <AlertTriangle className="size-3" />
                                </span>
                              )}
                            </td>
                            <td className="py-2 max-w-[260px] truncate">{p.prod_name}</td>
                            <td className="py-2 px-3 text-xs text-muted-foreground">{p.depto ?? "(sem)"}</td>
                            <td className="py-2 px-3 text-xs text-muted-foreground">{p.secao ?? "(sem)"}</td>
                            <td className="num py-2 pl-8 text-right whitespace-nowrap font-medium">{fmtBRL(p.val)}</td>
                            <td className="num py-2 pl-8 text-right whitespace-nowrap text-muted-foreground">
                              {(p.share * 100).toFixed(2)}%
                            </td>
                          </tr>
                        );
                      })}
                      {tableRows.length === 0 && !isFetching && (
                        <tr><td colSpan={6} className="py-8 text-center text-sm text-muted-foreground">Nenhum produto.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ProductList({ items, onRemove }: { items: { prod_code: string; prod_name: string | null; exists_in_base: boolean; depto: string | null; secao: string | null; grupo: string | null; subgrupo: string | null }[]; onRemove: (code: string) => void }) {
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const PAGE = 50;
  const filtered = items.filter((i) =>
    !q.trim() || i.prod_code.toLowerCase().includes(q.toLowerCase()) || (i.prod_name ?? "").toLowerCase().includes(q.toLowerCase()));
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const rows = filtered.slice((page - 1) * PAGE, page * PAGE);

  return (
    <>
      <div className="mb-3 flex items-center gap-2">
        <div className="flex items-center gap-1 rounded-md border bg-background px-2 h-9 flex-1 max-w-sm">
          <Search className="size-3.5 text-muted-foreground" />
          <Input placeholder="Buscar PLU ou descrição…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }}
            className="h-7 border-0 px-1 text-sm shadow-none focus-visible:ring-0" />
        </div>
        <span className="text-xs text-muted-foreground">{filtered.length} de {items.length}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-[640px] w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
              <th className="py-2 pr-3">PLU</th>
              <th className="py-2 pr-3">Descrição</th>
              <th className="py-2 px-3">Depto</th>
              <th className="py-2 px-3">Seção</th>
              <th className="py-2 px-3">Grupo</th>
              <th className="py-2 px-3">Subgrupo</th>
              <th className="py-2 pl-3 text-right">Ação</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((i) => (
              <tr key={i.prod_code} className="border-b border-border/60 hover:bg-muted/40">
                <td className="py-2 pr-3 font-mono text-xs whitespace-nowrap">
                  {i.prod_code}
                  {!i.exists_in_base && (
                    <span title="PLU não existe mais na base atual" className="ml-1 inline-flex items-center text-amber-600">
                      <AlertTriangle className="size-3" />
                    </span>
                  )}
                </td>
                <td className="py-2 pr-3 max-w-[260px] truncate">{i.prod_name ?? "(produto inexistente)"}</td>
                <td className="py-2 px-3 text-xs text-muted-foreground">{i.depto ?? "(sem)"}</td>
                <td className="py-2 px-3 text-xs text-muted-foreground">{i.secao ?? "(sem)"}</td>
                <td className="py-2 px-3 text-xs text-muted-foreground">{i.grupo ?? "(sem)"}</td>
                <td className="py-2 px-3 text-xs text-muted-foreground">{i.subgrupo ?? "(sem)"}</td>
                <td className="py-2 pl-3 text-right">
                  <Button size="sm" variant="ghost" onClick={() => onRemove(i.prod_code)} title="Remover">
                    <Trash2 className="size-3.5 text-destructive" />
                  </Button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={7} className="py-8 text-center text-sm text-muted-foreground">
                {items.length === 0 ? "Adicione PLUs para começar." : "Nenhum produto encontrado com este filtro."}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
      {pages > 1 && (
        <div className="mt-3 flex items-center justify-end gap-2 text-xs text-muted-foreground">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Anterior</Button>
          <span>Página {page} de {pages}</span>
          <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => setPage(page + 1)}>Próxima</Button>
        </div>
      )}
    </>
  );
}
