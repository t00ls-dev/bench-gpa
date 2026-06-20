import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getAreaAnalysis, getFilterOptions } from "@/lib/analytics.functions";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { KpiCard, fmtBRL, fmtInt } from "@/components/kpi-card";
import { DateRangePicker } from "@/components/date-range-picker";
import { usePersistentState } from "@/hooks/use-persistent-state";
import { fmtBRShort } from "@/lib/utils";
import {
  Layers, ChevronLeft, ChevronRight, ChevronUp, ChevronDown, Search,
  FileText, Loader2, Bookmark,
} from "lucide-react";
import { Link } from "@tanstack/react-router";


export const Route = createFileRoute("/_authenticated/area")({
  component: AreaPage,
});

type Product = {
  prod_code: string; prod_name: string;
  depto: string | null; secao: string | null; grupo: string | null; subgrupo: string | null;
  val: number; qty: number;
};

type SortKey = "prod_code" | "prod_name" | "depto" | "secao" | "grupo" | "subgrupo" | "val" | "share";

const ALL = "__all__";






function fmtPct(n: number) {
  return `${(n * 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
}

function AreaPage() {
  const navigate = useNavigate();
  const getOpts = useServerFn(getFilterOptions);
  const getArea = useServerFn(getAreaAnalysis);

  type AF = {
    dateFrom: string; dateTo: string;
    store: string; depto: string; secao: string; grupo: string; subgrupo: string;
  };
  const [af, setAf] = usePersistentState<AF>("bench-gpa:filters:area", {
    dateFrom: "", dateTo: "",
    store: ALL, depto: ALL, secao: ALL, grupo: ALL, subgrupo: ALL,
  });
  const setStore = (v: string) => setAf({ ...af, store: v, depto: ALL, secao: ALL, grupo: ALL, subgrupo: ALL });
  const setDepto = (v: string) => setAf({ ...af, depto: v, secao: ALL, grupo: ALL, subgrupo: ALL });
  const setSecao = (v: string) => setAf({ ...af, secao: v, grupo: ALL, subgrupo: ALL });
  const setGrupo = (v: string) => setAf({ ...af, grupo: v, subgrupo: ALL });
  const setSubgrupo = (v: string) => setAf({ ...af, subgrupo: v });
  const setRange = (r: { from: string; to: string }) => setAf({ ...af, dateFrom: r.from, dateTo: r.to });
  const { dateFrom, dateTo, store, depto, secao, grupo, subgrupo } = af;

  const { data: opts } = useQuery({
    queryKey: ["filter-options-area", store, depto, secao, grupo],
    queryFn: () => getOpts({ data: {
      dateFrom: null, dateTo: null,
      stores: store !== ALL ? [store] : [],
      deptos: depto !== ALL ? [depto] : [],
      secoes: secao !== ALL ? [secao] : [],
      grupos: grupo !== ALL ? [grupo] : [],
    } }),
    staleTime: 5 * 60_000,
  });

  useEffect(() => {
    if (opts?.latestDate && (!dateFrom || !dateTo)) {
      const avail = (opts?.availableDates ?? []) as string[];
      const latest = opts.latestDate;
      const window = avail.filter((d) => d <= latest).slice(-7);
      setRange({ from: window[0] ?? latest, to: latest });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts?.latestDate]);

  useEffect(() => {
    const avail = (opts?.availableDates ?? []) as string[];
    if (!avail.length || !dateFrom || !dateTo) return;
    const within = avail.filter((d) => d >= dateFrom && d <= dateTo);
    if (within.length === 0 && opts?.latestDate) {
      setRange({ from: opts.latestDate, to: opts.latestDate });
    } else if (within.length && (within[0] !== dateFrom || within[within.length - 1] !== dateTo)) {
      setRange({ from: within[0], to: within[within.length - 1] });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts?.availableDates]);

  const stores = (opts?.stores ?? []) as { store_code: string; store_name: string }[];
  const deptos = (opts?.deptos ?? []) as string[];
  const secoes = (opts?.secoes ?? []) as string[];
  const grupos = (opts?.grupos ?? []) as string[];
  const subgrupos = (opts?.subgrupos ?? []) as string[];

  const { data, isFetching } = useQuery({
    queryKey: ["area-analysis", dateFrom, dateTo, store, depto, secao, grupo, subgrupo],
    queryFn: () => getArea({ data: {
      dateFrom, dateTo,
      store: store !== ALL ? store : null,
      depto: depto !== ALL ? depto : null,
      secao: secao !== ALL ? secao : null,
      grupo: grupo !== ALL ? grupo : null,
      subgrupo: subgrupo !== ALL ? subgrupo : null,
      prevFrom: null,
      prevTo: null,
    } }),
    enabled: !!dateFrom && !!dateTo,
  });

  const products = (data?.products ?? []) as Product[];
  const total = data?.total ?? 0;

  // Add participation share per product
  const enriched = useMemo(() => {
    return products.map((p) => ({
      ...p,
      share: total > 0 ? p.val / total : 0,
    }));
  }, [products, total]);

  // Breadcrumb path
  const pathParts: string[] = [];
  if (store !== ALL) {
    const s = stores.find((x) => x.store_code === store);
    pathParts.push(`Loja ${s ? `${s.store_code}: ${s.store_name}` : store}`);
  } else {
    pathParts.push("Todas as lojas");
  }
  if (depto !== ALL) pathParts.push(depto);
  if (secao !== ALL) pathParts.push(secao);
  if (grupo !== ALL) pathParts.push(grupo);
  if (subgrupo !== ALL) pathParts.push(subgrupo);

  // (active chips removed per spec)

  // Table
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("val");
  const [sortAsc, setSortAsc] = useState(false);
  const [pageSize, setPageSize] = useState<25 | 50 | 100 | 250>(50);
  const [page, setPage] = useState(1);

  useEffect(() => { setPage(1); }, [search, pageSize, sortKey, sortAsc, dateFrom, dateTo, store, depto, secao, grupo, subgrupo]);

  const filteredTable = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = enriched;
    if (q) list = list.filter((p) =>
      p.prod_code.toLowerCase().includes(q) ||
      p.prod_name.toLowerCase().includes(q)
    );
    const sorted = [...list].sort((a, b) => {
      let av: number | string = 0, bv: number | string = 0;
      switch (sortKey) {
        case "prod_code": av = a.prod_code; bv = b.prod_code; break;
        case "prod_name": av = a.prod_name; bv = b.prod_name; break;
        case "depto": av = a.depto ?? ""; bv = b.depto ?? ""; break;
        case "secao": av = a.secao ?? ""; bv = b.secao ?? ""; break;
        case "grupo": av = a.grupo ?? ""; bv = b.grupo ?? ""; break;
        case "subgrupo": av = a.subgrupo ?? ""; bv = b.subgrupo ?? ""; break;
        case "val": av = a.val; bv = b.val; break;
        case "share": av = a.share; bv = b.share; break;
      }
      if (typeof av === "string") return sortAsc ? (av as string).localeCompare(bv as string) : (bv as string).localeCompare(av as string);
      return sortAsc ? (av as number) - (bv as number) : (bv as number) - (av as number);
    });
    return sorted;
  }, [enriched, search, sortKey, sortAsc]);

  const totalRows = filteredTable.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
  const pageRows = filteredTable.slice((page - 1) * pageSize, page * pageSize);

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortAsc(!sortAsc);
    else { setSortKey(k); setSortAsc(k === "prod_code" || k === "prod_name" || k === "depto" || k === "secao" || k === "grupo" || k === "subgrupo"); }
  };

  const openProduct = (code: string) => {
    navigate({ to: "/produto", search: { plu: code } });
  };




  const exportPdf = () => {
    const win = window.open("", "_blank", "width=900,height=1000");
    if (!win) return;
    const area = pathParts.join(" › ");
    const today = new Date().toLocaleDateString("pt-BR");
    const rowsHtml = filteredTable.map((p) => `
      <tr>
        <td>${escapeHtml(p.prod_code)}</td>
        <td>${escapeHtml(p.prod_name)}</td>
        <td class="num">${escapeHtml(fmtBRL(p.val))}</td>
        <td class="estoque"></td>
      </tr>`).join("");
    win.document.write(`<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><title>Análise de Área (Conferência de Estoque)</title>
<style>
  *{box-sizing:border-box;font-family:Arial,Helvetica,sans-serif}
  body{margin:24px;color:#111;font-size:11px}
  h1{font-size:16px;margin:0 0 4px}
  .meta{color:#555;font-size:10px;margin-bottom:12px}
  .meta strong{color:#111}
  table{width:100%;border-collapse:collapse}
  th,td{border:1px solid #999;padding:5px 6px;text-align:left;vertical-align:top}
  th{background:#eef;font-size:10px;text-transform:uppercase;letter-spacing:.03em}
  td.num{text-align:right;white-space:nowrap}
  td.estoque{width:90px;height:24px}
  tr{page-break-inside:avoid}
  thead{display:table-header-group}
  @media print{ body{margin:12mm} }
</style></head><body>
<h1>Análise de Área (Conferência de Estoque)</h1>
<div class="meta">
  <div><strong>Área:</strong> ${escapeHtml(area)}</div>
  <div><strong>Período:</strong> ${escapeHtml(fmtBRShort(dateFrom))} a ${escapeHtml(fmtBRShort(dateTo))}</div>
  <div><strong>Produtos listados:</strong> ${filteredTable.length} &nbsp;·&nbsp; <strong>Emissão:</strong> ${escapeHtml(today)}</div>
</div>
<table>
  <thead><tr><th style="width:90px">PLU</th><th>Produto</th><th style="width:110px;text-align:right">Venda</th><th style="width:120px">Estoque</th></tr></thead>
  <tbody>${rowsHtml || `<tr><td colspan="4" style="text-align:center;padding:24px">Nenhum produto.</td></tr>`}</tbody>
</table>
<script>window.onload=()=>{setTimeout(()=>window.print(),250)}<\/script>
</body></html>`);
    win.document.close();
  };

  const ready = !!dateFrom && !!dateTo;
  const noSale = data?.plusWithoutSale ?? 0;

  return (
    <div>
      <header className="mb-6">
        <h1 className="font-display text-2xl sm:text-3xl font-bold flex items-center gap-2">
          <Layers className="size-7 text-primary shrink-0" /> Análise de Área
        </h1>
        <p className="text-sm text-muted-foreground">
          Hierarquia Loja → Departamento → Seção → Grupo → Subgrupo. Identifique produtos com e sem venda para apoio operacional.
        </p>
      </header>

      {/* Filtros */}
      <div className="kpi-card mb-4 space-y-3">
        <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-6">
          <div>
            <Label className="text-xs">Período</Label>
            <div className="mt-1">
              <DateRangePicker
                from={dateFrom}
                to={dateTo}
                reference={opts?.latestDate ?? undefined}
                availableDates={opts?.availableDates ?? []}
                onChange={setRange}
              />
            </div>
          </div>
          <div>
            <Label className="text-xs">Loja</Label>
            <Select value={store} onValueChange={setStore}>
              <SelectTrigger className="mt-1 h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Todas</SelectItem>
                {stores.map((s) => <SelectItem key={s.store_code} value={s.store_code}>{s.store_code}: {s.store_name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Departamento</Label>
            <Select value={depto} onValueChange={setDepto}>
              <SelectTrigger className="mt-1 h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Todos</SelectItem>
                {deptos.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Seção</Label>
            <Select value={secao} onValueChange={setSecao} disabled={depto === ALL && secoes.length === 0}>
              <SelectTrigger className="mt-1 h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Todas</SelectItem>
                {secoes.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Grupo</Label>
            <Select value={grupo} onValueChange={setGrupo} disabled={grupos.length === 0}>
              <SelectTrigger className="mt-1 h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Todos</SelectItem>
                {grupos.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Subgrupo</Label>
            <Select value={subgrupo} onValueChange={setSubgrupo} disabled={subgrupos.length === 0}>
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
        <div className="kpi-card text-center text-muted-foreground">Selecione um período para iniciar a análise.</div>
      ) : (
        <>
          {/* KPIs */}
          <section className="mb-4 grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
            <KpiCard label="Venda Total" value={fmtBRL(total)} />
            <KpiCard label="PLUs (área)" value={fmtInt(data?.plusTotal ?? 0)} />
            <KpiCard label="PLUs com venda" value={fmtInt(data?.plusWithSale ?? 0)} />
            <KpiCard label="PLUs sem venda" value={fmtInt(noSale)} />
            <KpiCard label="Venda média por PLU" value={fmtBRL(data?.avgPerPlu ?? 0)} />
          </section>

          {/* Tabela */}
          <div className="kpi-card">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <h2 className="font-display text-lg font-semibold">Produtos da área</h2>
              {isFetching && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
              <div className="ml-auto flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1 rounded-md border bg-background px-2 h-9">
                  <Search className="size-3.5 text-muted-foreground" />
                  <Input
                    placeholder="Buscar PLU ou descrição…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="h-7 w-40 sm:w-56 border-0 px-1 text-sm shadow-none focus-visible:ring-0"
                  />
                </div>
                <Select value={String(pageSize)} onValueChange={(v) => setPageSize(Number(v) as 25 | 50 | 100 | 250)}>
                  <SelectTrigger className="h-9 w-[110px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="25">25 / página</SelectItem>
                    <SelectItem value="50">50 / página</SelectItem>
                    <SelectItem value="100">100 / página</SelectItem>
                    <SelectItem value="250">250 / página</SelectItem>
                  </SelectContent>
                </Select>
                <Button variant="outline" size="sm" onClick={exportPdf} className="h-9">
                  <FileText className="mr-1.5 size-4" /> PDF
                </Button>

              </div>
            </div>

            <div className="overflow-x-auto -mx-3 px-3 sm:mx-0 sm:px-0">
              <table className="min-w-[860px] w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <Th label="PLU" k="prod_code" sortKey={sortKey} sortAsc={sortAsc} toggle={toggleSort} />
                    <Th label="Descrição" k="prod_name" sortKey={sortKey} sortAsc={sortAsc} toggle={toggleSort} />
                    <Th label="Depto" k="depto" sortKey={sortKey} sortAsc={sortAsc} toggle={toggleSort} />
                    <Th label="Seção" k="secao" sortKey={sortKey} sortAsc={sortAsc} toggle={toggleSort} />
                    <Th label="Grupo" k="grupo" sortKey={sortKey} sortAsc={sortAsc} toggle={toggleSort} />
                    <Th label="Subgrupo" k="subgrupo" sortKey={sortKey} sortAsc={sortAsc} toggle={toggleSort} />
                    <Th label="Venda" k="val" sortKey={sortKey} sortAsc={sortAsc} toggle={toggleSort} align="right" className="pl-8" />
                    <Th label="Part. %" k="share" sortKey={sortKey} sortAsc={sortAsc} toggle={toggleSort} align="right" className="pl-8" />

                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((p) => {
                    const noSaleRow = p.val === 0;
                    return (
                      <tr
                        key={p.prod_code}
                        onClick={() => openProduct(p.prod_code)}
                        className={`cursor-pointer border-b border-border/60 hover:bg-muted/40 ${noSaleRow ? "bg-amber-50/40" : ""}`}
                        title="Abrir Análise de Produto"
                      >
                        <td className="py-2 font-mono text-xs whitespace-nowrap">{p.prod_code}</td>
                        <td className="py-2 max-w-[260px] truncate">{p.prod_name}</td>
                        <td className="py-2 text-xs text-muted-foreground max-w-[120px] truncate">{p.depto ?? "(sem)"}</td>
                        <td className="py-2 text-xs text-muted-foreground max-w-[120px] truncate">{p.secao ?? "(sem)"}</td>
                        <td className="py-2 text-xs text-muted-foreground max-w-[120px] truncate">{p.grupo ?? "(sem)"}</td>
                        <td className="py-2 text-xs text-muted-foreground max-w-[120px] truncate">{p.subgrupo ?? "(sem)"}</td>
                        <td className="num py-2 pl-8 text-right whitespace-nowrap font-medium">{fmtBRL(p.val)}</td>
                        <td className="num py-2 pl-8 text-right whitespace-nowrap text-muted-foreground">{fmtPct(p.share)}</td>

                      </tr>
                    );
                  })}
                  {pageRows.length === 0 && !isFetching && (
                    <tr><td colSpan={8} className="py-8 text-center text-sm text-muted-foreground">Nenhum produto encontrado.</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
              <div>
                Exibindo {totalRows === 0 ? 0 : (page - 1) * pageSize + 1}–{Math.min(page * pageSize, totalRows)} de {fmtInt(totalRows)} produtos
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                  <ChevronLeft className="size-4" />
                </Button>
                <span>Página {page} de {totalPages}</span>
                <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
                  <ChevronRight className="size-4" />
                </Button>
              </div>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Linhas em amarelo indicam produtos sem venda no período. Clique em uma linha para abrir a Análise de Produto.
            </p>
          </div>
        </>
      )}
    </div>
  );
}

function escapeHtml(s: string) {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!)
  );
}

function Th({ label, k, sortKey, sortAsc, toggle, align = "left", className = "" }: {
  label: string; k: SortKey; sortKey: SortKey; sortAsc: boolean;
  toggle: (k: SortKey) => void; align?: "left" | "right"; className?: string;
}) {
  const active = sortKey === k;
  return (
    <th className={`py-2 ${align === "right" ? "text-right" : ""} ${className}`}>
      <button
        onClick={() => toggle(k)}
        className={`inline-flex items-center gap-1 hover:text-foreground ${active ? "text-foreground" : ""}`}
      >
        {label}
        {active && (sortAsc ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />)}
      </button>
    </th>
  );
}

