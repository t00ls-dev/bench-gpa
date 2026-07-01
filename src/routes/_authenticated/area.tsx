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
import { MultiSelect } from "@/components/multi-select";
import { usePersistentState } from "@/hooks/use-persistent-state";
import { fmtBRShort } from "@/lib/utils";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import {
  Layers, ChevronLeft, ChevronRight, ChevronUp, ChevronDown, Search,
  FileText, Loader2,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/area")({
  component: AreaPage,
});

type Product = {
  prod_code: string; prod_name: string;
  depto: string | null; secao: string | null; grupo: string | null; subgrupo: string | null;
  val: number; qty: number; lastSaleDate: string | null;
};

type SortKey = "prod_code" | "prod_name" | "depto" | "secao" | "grupo" | "subgrupo" | "val" | "share";

function fmtPct(n: number) {
  return `${(n * 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
}

type AF = {
  dateFrom: string; dateTo: string;
  stores: string[]; deptos: string[]; secoes: string[]; grupos: string[]; subgrupos: string[];
  prodCodes: string[];
};

function AreaPage() {
  const navigate = useNavigate();
  const getOpts = useServerFn(getFilterOptions);
  const getArea = useServerFn(getAreaAnalysis);

  const [af, setAf] = usePersistentState<AF>("bench-gpa:filters:area", {
    dateFrom: "", dateTo: "",
    stores: [], deptos: [], secoes: [], grupos: [], subgrupos: [], prodCodes: [],
  });
  const patch = (p: Partial<AF>) => setAf({ ...af, ...p });
  const setStores = (v: string[]) => patch({ stores: v, deptos: [], secoes: [], grupos: [], subgrupos: [] });
  const setDeptos = (v: string[]) => patch({ deptos: v, secoes: [], grupos: [], subgrupos: [] });
  const setSecoes = (v: string[]) => patch({ secoes: v, grupos: [], subgrupos: [] });
  const setGrupos = (v: string[]) => patch({ grupos: v, subgrupos: [] });
  const setSubgrupos = (v: string[]) => patch({ subgrupos: v });
  const setRange = (r: { from: string; to: string }) => patch({ dateFrom: r.from, dateTo: r.to });

  const { dateFrom, dateTo, stores: fStores, deptos: fDeptos, secoes: fSecoes, grupos: fGrupos, subgrupos: fSubgrupos, prodCodes } = af;

  // Cada dropdown consulta opções considerando apenas seus filtros ANCESTRAIS.
  // Isso evita que selecionar em Seção/Grupo restrinja o próprio conjunto de opções.
  const baseOpts = useQuery({
    queryKey: ["filter-options-area:base"],
    queryFn: () => getOpts({ data: { dateFrom: null, dateTo: null, stores: [], deptos: [], secoes: [], grupos: [] } }),
    staleTime: 5 * 60_000,
  });
  const deptosOpts = useQuery({
    queryKey: ["filter-options-area:deptos", fStores],
    queryFn: () => getOpts({ data: { dateFrom: null, dateTo: null, stores: fStores, deptos: [], secoes: [], grupos: [] } }),
    staleTime: 5 * 60_000,
  });
  const secoesOpts = useQuery({
    queryKey: ["filter-options-area:secoes", fStores, fDeptos],
    queryFn: () => getOpts({ data: { dateFrom: null, dateTo: null, stores: fStores, deptos: fDeptos, secoes: [], grupos: [] } }),
    staleTime: 5 * 60_000,
  });
  const gruposOpts = useQuery({
    queryKey: ["filter-options-area:grupos", fStores, fDeptos, fSecoes],
    queryFn: () => getOpts({ data: { dateFrom: null, dateTo: null, stores: fStores, deptos: fDeptos, secoes: fSecoes, grupos: [] } }),
    staleTime: 5 * 60_000,
  });
  const subgruposOpts = useQuery({
    queryKey: ["filter-options-area:subgrupos", fStores, fDeptos, fSecoes, fGrupos],
    queryFn: () => getOpts({ data: { dateFrom: null, dateTo: null, stores: fStores, deptos: fDeptos, secoes: fSecoes, grupos: fGrupos } }),
    staleTime: 5 * 60_000,
  });
  const opts = baseOpts.data;

  useEffect(() => {
    if (opts?.latestDate && (!dateFrom || !dateTo)) {
      const avail = (opts?.availableDates ?? []) as string[];
      const latest = opts.latestDate;
      const win = avail.filter((d) => d <= latest).slice(-7);
      setRange({ from: win[0] ?? latest, to: latest });
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

  const stores = (baseOpts.data?.stores ?? []) as { store_code: string; store_name: string }[];
  const deptos = (deptosOpts.data?.deptos ?? []) as string[];
  const secoes = (secoesOpts.data?.secoes ?? []) as string[];
  const grupos = (gruposOpts.data?.grupos ?? []) as string[];
  const subgrupos = (subgruposOpts.data?.subgrupos ?? []) as string[];

  // Uma única consulta ao servidor: traz o universo de produtos da área
  // (com e sem venda). O filtro de prodCodes é aplicado no cliente para
  // evitar uma segunda chamada idêntica ao banco.
  // Gate: Loja + Departamento são obrigatórios para evitar varredura excessiva.
  const ready = !!dateFrom && !!dateTo && fStores.length > 0 && fDeptos.length > 0;

  const { data, isFetching, isError, error, refetch } = useQuery({
    queryKey: ["area-analysis", dateFrom, dateTo, fStores, fDeptos, fSecoes, fGrupos, fSubgrupos],
    queryFn: () => getArea({ data: {
      dateFrom, dateTo,
      stores: fStores, deptos: fDeptos, secoes: fSecoes, grupos: fGrupos, subgrupos: fSubgrupos,
      prodCodes: [],
    } }),
    enabled: ready,
    staleTime: 60_000,
    retry: 1,
  });


  const allProducts = (data?.products ?? []) as Product[];

  const productOptions = useMemo(() =>
    allProducts
      .map((p) => ({ value: p.prod_code, label: `${p.prod_code} - ${p.prod_name}` }))
      .sort((a, b) => a.label.localeCompare(b.label)),
    [allProducts]
  );

  // Reconcilia prodCodes selecionados quando os filtros pais mudam.
  useEffect(() => {
    if (!data) return;
    const valid = new Set(allProducts.map((p) => p.prod_code));
    const next = prodCodes.filter((c) => valid.has(c));
    if (next.length !== prodCodes.length) patch({ prodCodes: next });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  // Aplica filtro de produtos no cliente.
  const products = useMemo(
    () => prodCodes.length === 0 ? allProducts : allProducts.filter((p) => prodCodes.includes(p.prod_code)),
    [allProducts, prodCodes]
  );
  const total = useMemo(
    () => prodCodes.length === 0 ? (data?.total ?? 0) : products.reduce((s, p) => s + p.val, 0),
    [data, products, prodCodes]
  );

  const enriched = useMemo(() => products.map((p) => ({
    ...p, share: total > 0 ? p.val / total : 0,
  })), [products, total]);

  // Breadcrumb
  const pathParts: string[] = [];
  if (fStores.length === 0) pathParts.push("Todas as lojas");
  else if (fStores.length === 1) {
    const s = stores.find((x) => x.store_code === fStores[0]);
    pathParts.push(`Loja ${s ? `${s.store_code} - ${s.store_name}` : fStores[0]}`);
  } else pathParts.push(`${fStores.length} lojas`);
  const summarize = (arr: string[], one: string, many: string) =>
    arr.length === 1 ? arr[0] : arr.length > 1 ? `${arr.length} ${many}` : null;
  const dp = summarize(fDeptos, "depto", "departamentos"); if (dp) pathParts.push(dp);
  const sc = summarize(fSecoes, "seção", "seções"); if (sc) pathParts.push(sc);
  const gp = summarize(fGrupos, "grupo", "grupos"); if (gp) pathParts.push(gp);
  const sg = summarize(fSubgrupos, "subgrupo", "subgrupos"); if (sg) pathParts.push(sg);
  if (prodCodes.length) pathParts.push(`${prodCodes.length} produto(s)`);

  // Table
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("val");
  const [sortAsc, setSortAsc] = useState(false);
  const [pageSize, setPageSize] = useState<25 | 50 | 100 | 250>(50);
  const [page, setPage] = useState(1);

  useEffect(() => { setPage(1); }, [search, pageSize, sortKey, sortAsc, dateFrom, dateTo, fStores, fDeptos, fSecoes, fGrupos, fSubgrupos, prodCodes]);

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

  // Gera um PDF de verdade em A4 (210x297mm), via jsPDF + autoTable.
  // Diferente da abordagem anterior (window.print()), o tamanho da página
  // não depende do diálogo de impressão do navegador — é fixado no arquivo.
  const exportPdf = () => {
    const area = pathParts.join(" › ");
    // "Data da base": os dados sempre correspondem ao dia anterior, então
    // usamos a última data disponível na base (não a data atual do sistema)
    // como referência para não contar um dia a mais artificialmente.
    const baseDateIso = opts?.latestDate ?? dateTo;
    const daysSince = (iso: string | null) => {
      if (!iso || !baseDateIso) return "-";
      const base = new Date(baseDateIso + "T00:00:00");
      const d = new Date(iso + "T00:00:00");
      const diff = Math.floor((base.getTime() - d.getTime()) / 86400000);
      return diff < 0 ? "0" : String(diff);
    };

    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const marginX = 10;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.setTextColor(17, 17, 17);
    doc.text("Análise de Área", marginX, 12);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(85, 85, 85);
    doc.text(`Área: ${area}`, marginX, 18);
    doc.text(`Período: ${fmtBRShort(dateFrom)} - ${fmtBRShort(dateTo)}`, marginX, 22.5);
    doc.text(`Produtos listados: ${filteredTable.length}`, marginX, 27);

    autoTable(doc, {
      startY: 31,
      margin: { left: marginX, right: marginX },
      head: [["PLU", "PRODUTO", "VENDA", "DIAS S/ VENDA", "QUANTIDADE", "DATA DE VALIDADE"]],
      body: filteredTable.length
        ? filteredTable.map((p) => [
            p.prod_code,
            p.prod_name,
            fmtBRL(p.val),
            daysSince(p.lastSaleDate),
            "",
            "",
          ])
        : [["", "Nenhum produto.", "", "", "", ""]],
      theme: "grid",
      styles: {
        font: "helvetica",
        fontSize: 8,
        cellPadding: 1.5,
        overflow: "linebreak",
        valign: "top",
        lineColor: [153, 153, 153],
        lineWidth: 0.1,
        textColor: [17, 17, 17],
      },
      headStyles: {
        fillColor: [238, 238, 255],
        textColor: [17, 17, 17],
        fontStyle: "bold",
        fontSize: 7.5,
        halign: "center",
      },
      columnStyles: {
        0: { cellWidth: 18 },                     // PLU
        1: { cellWidth: 73 },                     // Produto
        2: { cellWidth: 22, halign: "right" },     // Venda
        3: { cellWidth: 26, halign: "right" },     // Dias s/ Venda
        4: { cellWidth: 22, minCellHeight: 7 },    // Quantidade (preenchimento manual)
        5: { cellWidth: 29, minCellHeight: 7 },    // Data de Validade (preenchimento manual)
      },
      didParseCell: (hookData) => {
        // Nas linhas de dados, deixa as duas últimas colunas em branco com
        // altura mínima para preenchimento manual no papel.
        if (hookData.section === "body" && (hookData.column.index === 4 || hookData.column.index === 5)) {
          hookData.cell.text = [];
        }
      },
    });

    doc.save(`analise-area_${dateFrom}_${dateTo}.pdf`);
  };

  const noSale = data?.plusWithoutSale ?? 0;


  return (
    <div>
      <header className="mb-6">
        <h1 className="font-display text-2xl sm:text-3xl font-bold flex items-center gap-2">
          <Layers className="size-7 text-primary shrink-0" /> Análise de Área
        </h1>
        <p className="text-sm text-muted-foreground">
          Identifique produtos com e sem venda para apoio operacional.
        </p>
      </header>

      {/* Filtros */}
      <div className="kpi-card mb-4 space-y-3">
        <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-6">
          <div className="lg:col-span-2">
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
            <MultiSelect
              single
              label="Selecione"
              options={stores.map((s) => ({ value: s.store_code, label: `${s.store_code} - ${s.store_name}` }))}
              value={fStores}
              onChange={setStores}
            />
          </div>
          <div>
            <Label className="text-xs">Departamento</Label>
            <MultiSelect single label="Selecione" options={deptos.map((d) => ({ value: d, label: d }))} value={fDeptos} onChange={setDeptos} />
          </div>

          <div>
            <Label className="text-xs">Seção</Label>
            <MultiSelect label="Todas" options={secoes.map((s) => ({ value: s, label: s }))} value={fSecoes} onChange={setSecoes} />
          </div>
          <div>
            <Label className="text-xs">Grupo</Label>
            <MultiSelect label="Todos" options={grupos.map((g) => ({ value: g, label: g }))} value={fGrupos} onChange={setGrupos} />
          </div>
          <div className="md:col-span-2">
            <Label className="text-xs">Subgrupo</Label>
            <MultiSelect label="Todos" options={subgrupos.map((s) => ({ value: s, label: s }))} value={fSubgrupos} onChange={setSubgrupos} />
          </div>
          <div className="md:col-span-3 lg:col-span-2">
            <Label className="text-xs">Produtos</Label>
            <MultiSelect
              label="Todos"
              options={productOptions}
              value={prodCodes}
              onChange={(v) => patch({ prodCodes: v })}
            />
          </div>
        </div>
      </div>


      {!ready ? (
        <div className="kpi-card text-center text-muted-foreground">
          {(!dateFrom || !dateTo)
            ? "Selecione um período para iniciar a análise."
            : "Selecione ao menos uma Loja e um Departamento para iniciar a análise."}
        </div>
      ) : isError ? (

        <div className="kpi-card text-center">
          <p className="text-sm text-destructive mb-3">Não foi possível carregar a análise: {(error as Error)?.message ?? "erro desconhecido"}.</p>
          <Button variant="outline" size="sm" onClick={() => refetch()}>Tentar novamente</Button>
        </div>
      ) : (
        <>
          <section className="mb-4 grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
            <KpiCard label="Venda Total" value={fmtBRL(total)} />
            <KpiCard label="PLUs (área)" value={fmtInt(data?.plusTotal ?? 0)} />
            <KpiCard label="PLUs com venda" value={fmtInt(data?.plusWithSale ?? 0)} />
            <KpiCard label="PLUs sem venda" value={fmtInt(noSale)} />
            <KpiCard label="Venda média por PLU" value={fmtBRL(data?.avgPerPlu ?? 0)} />
          </section>

          <div className="kpi-card min-w-0">
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
