import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getAreaAnalysis, getAreaFilterHierarchy } from "@/lib/analytics.functions";
import type { AreaHierarchyItem } from "@/lib/analytics.functions";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { KpiCard, fmtBRL, fmtInt } from "@/components/kpi-card";
import { DateRangePicker } from "@/components/date-range-picker";
import { MultiSelect } from "@/components/multi-select";
import { usePersistentState } from "@/hooks/use-persistent-state";
import { fmtBRShort } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Layers,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  Search,
  FileText,
  Loader2,
  X,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/area")({
  component: AreaPage,
});

type Product = {
  prod_code: string;
  prod_name: string;
  depto: string | null;
  secao: string | null;
  grupo: string | null;
  subgrupo: string | null;
  val: number;
  qty: number;
  lastSaleDate: string | null;
};

type SortKey = "prod_code" | "prod_name" | "val" | "daysSince";

type AF = {
  dateFrom: string;
  dateTo: string;
  stores: string[];
  deptos: string[];
  secoes: string[];
  grupos: string[];
  subgrupos: string[];
};

function dedupe<T>(arr: T[]): T[] {
  return [...new Set(arr)];
}

function filteredHierarchy(
  h: AreaHierarchyItem[],
  stores: string[],
  deptos: string[],
  secoes: string[],
  grupos: string[],
) {
  return h.filter(
    (r) =>
      (stores.length === 0 || stores.includes(r.store_code)) &&
      (deptos.length === 0 || (r.depto && deptos.includes(r.depto))) &&
      (secoes.length === 0 || (r.secao && secoes.includes(r.secao))) &&
      (grupos.length === 0 || (r.grupo && grupos.includes(r.grupo))),
  );
}

function AreaPage() {
  const navigate = useNavigate();
  const getHierarchy = useServerFn(getAreaFilterHierarchy);
  const getArea = useServerFn(getAreaAnalysis);

  const [af, setAf] = usePersistentState<AF>("bench-gpa:filters:area", {
    dateFrom: "",
    dateTo: "",
    stores: [],
    deptos: [],
    secoes: [],
    grupos: [],
    subgrupos: [],
  });
  const patch = (p: Partial<AF>) => setAf({ ...af, ...p });
  const setStores = (v: string[]) =>
    patch({ stores: v, deptos: [], secoes: [], grupos: [], subgrupos: [] });
  const setDeptos = (v: string[]) => patch({ deptos: v, secoes: [], grupos: [], subgrupos: [] });
  const setSecoes = (v: string[]) => patch({ secoes: v, grupos: [], subgrupos: [] });
  const setGrupos = (v: string[]) => patch({ grupos: v, subgrupos: [] });
  const setSubgrupos = (v: string[]) => patch({ subgrupos: v });
  const setRange = (r: { from: string; to: string }) => patch({ dateFrom: r.from, dateTo: r.to });

  const {
    dateFrom,
    dateTo,
    stores: fStores,
    deptos: fDeptos,
    secoes: fSecoes,
    grupos: fGrupos,
    subgrupos: fSubgrupos,
  } = af;

  // Hierarquia completa carregada em 1 chamada (Critical #4)
  const hierQ = useQuery({
    queryKey: ["area-filter-hierarchy"],
    queryFn: () => getHierarchy({}),
    staleTime: 10 * 60_000,
    gcTime: 30 * 60_000,

  });
  const hierData = hierQ.data;

  const hierarchy = hierData?.hierarchy ?? [];
  const stores = useMemo(() => {
    const seen = new Set<string>();
    return hierarchy.filter((r) => {
      if (seen.has(r.store_code)) return false;
      seen.add(r.store_code);
      return true;
    });
  }, [hierarchy]);

  const filtered = useMemo(
    () => filteredHierarchy(hierarchy, fStores, fDeptos, fSecoes, fGrupos),
    [hierarchy, fStores, fDeptos, fSecoes, fGrupos],
  );

  const deptosOpts = useMemo(
    () => dedupe(filtered.map((r) => r.depto).filter(Boolean) as string[]).sort(),
    [filtered],
  );
  const secoesOpts = useMemo(
    () => dedupe(filtered.map((r) => r.secao).filter(Boolean) as string[]).sort(),
    [filtered],
  );
  const gruposOpts = useMemo(
    () => dedupe(filtered.map((r) => r.grupo).filter(Boolean) as string[]).sort(),
    [filtered],
  );

  const subFiltered = useMemo(
    () => filteredHierarchy(hierarchy, fStores, fDeptos, fSecoes, fGrupos),
    [hierarchy, fStores, fDeptos, fSecoes, fGrupos],
  );
  const subgruposOpts = useMemo(
    () => dedupe(subFiltered.map((r) => r.subgrupo).filter(Boolean) as string[]).sort(),
    [subFiltered],
  );

  const opts = hierData;

  // "Data da base": os dados sempre correspondem ao dia anterior, então
  // usamos a última data disponível na base (não a data atual do sistema)
  // como referência para não contar um dia a mais artificialmente.
  // Reaproveitado tanto na tabela da tela quanto no export em PDF.
  const baseDateIso = dateTo || opts?.latestDate;
  const daysSinceNum = (iso: string | null): number | null => {
    if (!iso || !baseDateIso) return null;
    const base = new Date(baseDateIso + "T00:00:00");
    const d = new Date(iso + "T00:00:00");
    const diff = Math.floor((base.getTime() - d.getTime()) / 86400000);
    return diff < 0 ? 0 : diff;
  };
  const daysSinceLabel = (iso: string | null): string => {
    const n = daysSinceNum(iso);
    return n === null ? "-" : String(n);
  };

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

  // Gate: Loja + Departamento são obrigatórios
  const ready = !!dateFrom && !!dateTo && fStores.length > 0 && fDeptos.length > 0;

  // Table state
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("val");
  const [sortAsc, setSortAsc] = useState(false);
  const [pageSize, setPageSize] = useState<25 | 50 | 100 | 250>(50);
  const [page, setPage] = useState(1);

  const sortDir = sortAsc ? "asc" : "desc";

  useEffect(() => {
    setPage(1);
  }, [
    search,
    sortKey,
    sortAsc,
    pageSize,
    dateFrom,
    dateTo,
    fStores,
    fDeptos,
    fSecoes,
    fGrupos,
    fSubgrupos,
  ]);

  // Consulta paginada com busca/ordenação no servidor (Critical #1 + #3)
  const { data, isFetching, isLoading, isError, error, refetch } = useQuery({
    queryKey: [
      "area-analysis",
      dateFrom,
      dateTo,
      fStores,
      fDeptos,
      fSecoes,
      fGrupos,
      fSubgrupos,
      page,
      pageSize,
      search,
      sortKey,
      sortDir,
    ],
    queryFn: () =>
      getArea({
        data: {
          dateFrom,
          dateTo,
          stores: fStores,
          deptos: fDeptos,
          secoes: fSecoes,
          grupos: fGrupos,
          subgrupos: fSubgrupos,
          page,
          pageSize,
          search,
          sortBy: sortKey,
          sortDir,
        },
      }),
    enabled: ready,
    staleTime: 60_000,
    retry: 1,
    placeholderData: (prev) => prev,
  });

  const products = (data?.products ?? []) as Product[];
  const total = data?.total ?? 0;
  const noSale = data?.plusWithoutSale ?? 0;
  const totalRows = data?.totalProducts ?? 0;
  const totalPages = data?.totalPages ?? 1;

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortAsc(!sortAsc);
    else {
      setSortKey(k);
      setSortAsc(k === "prod_code" || k === "prod_name");
    }
  };

  const openProduct = (code: string) => {
    navigate({ to: "/produto", search: { plu: code } });
  };

  // Breadcrumb
  const pathParts: string[] = [];
  if (fStores.length === 0) pathParts.push("Todas as lojas");
  else if (fStores.length === 1) {
    const s = stores.find((x) => x.store_code === fStores[0]);
    pathParts.push(`Loja ${s ? `${s.store_code} - ${s.store_name}` : fStores[0]}`);
  } else pathParts.push(`${fStores.length} lojas`);
  const summarize = (arr: string[], one: string, many: string) =>
    arr.length === 1 ? arr[0] : arr.length > 1 ? `${arr.length} ${many}` : null;
  const dp = summarize(fDeptos, "depto", "departamentos");
  if (dp) pathParts.push(dp);
  const sc = summarize(fSecoes, "seção", "seções");
  if (sc) pathParts.push(sc);
  const gp = summarize(fGrupos, "grupo", "grupos");
  if (gp) pathParts.push(gp);
  const sg = summarize(fSubgrupos, "subgrupo", "subgrupos");
  if (sg) pathParts.push(sg);

  const [pdfLoading, setPdfLoading] = useState(false);

  const openPdfInNewTab = async () => {
    setPdfLoading(true);
    try {
      const area = pathParts.join(" › ");

      // Para PDF, busca dados sem paginação — respeitando search/sort da tabela
      const allData = await getArea({
        data: {
          dateFrom,
          dateTo,
          stores: fStores,
          deptos: fDeptos,
          secoes: fSecoes,
          grupos: fGrupos,
          subgrupos: fSubgrupos,
          search: search.trim(),
          sortBy: sortKey,
          sortDir,
          page: null,
        },
      });
      const filtered = allData.products ?? [];


      const jsPDF = (await import("jspdf")).default;
      const autoTable = (await import("jspdf-autotable")).default;
      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const marginX = 10;

      doc.setFont("helvetica", "bold");
      doc.setFontSize(14);
      doc.setTextColor(17, 17, 17);
      doc.text("Análise de Área", marginX, 12);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(85, 85, 85);
      doc.text(`Área: ${area}`, marginX, 18);
      doc.text(`Período: ${fmtBRShort(dateFrom)} - ${fmtBRShort(dateTo)}`, marginX, 22.5);
      doc.text(`Produtos listados: ${filtered.length}`, marginX, 27);

      autoTable(doc, {
        startY: 31,
        margin: { left: marginX, right: marginX },
        head: [["PLU", "PRODUTO", "VENDA", "DIAS S/ VENDA", "QTD", "VALIDADE"]],
        body: filtered.length
          ? filtered.map((p) => [
              p.prod_code,
              p.prod_name,
              fmtBRL(p.val),
              daysSinceLabel(p.lastSaleDate),
              "",
              "",
            ])
          : [["", "Nenhum produto.", "", "", "", ""]],
        theme: "grid",
        styles: {
          font: "helvetica",
          fontSize: 8,
          cellPadding: 1.5,
          overflow: "hidden",
          valign: "middle",
          lineColor: [153, 153, 153],
          lineWidth: 0.1,
          textColor: [17, 17, 17],
        },
        headStyles: {
          fillColor: [238, 238, 255],
          textColor: [17, 17, 17],
          fontStyle: "bold",
          fontSize: 8,
          halign: "center",
        },
        columnStyles: {
          0: { cellWidth: 16 },
          1: { cellWidth: 82, overflow: "hidden" },
          2: { cellWidth: 23, halign: "right" },
          3: { cellWidth: 24, halign: "right" },
          4: { cellWidth: 20 },
          5: { cellWidth: 25 },
        },
        didParseCell: (hookData) => {
          if (
            hookData.section === "body" &&
            (hookData.column.index === 4 || hookData.column.index === 5)
          ) {
            hookData.cell.text = [];
          }
        },
        willDrawCell: (hookData) => {
          if (hookData.section === "body" && hookData.column.index === 1) {
            const cell = hookData.cell;
            const doc2 = hookData.doc;
            const raw = Array.isArray(cell.text) ? cell.text.join(" ") : String(cell.text ?? "");
            const maxWidth = cell.width - cell.padding("horizontal");
            let text = raw;
            if (doc2.getTextWidth(text) > maxWidth) {
              while (text.length > 1 && doc2.getTextWidth(text + "…") > maxWidth) {
                text = text.slice(0, -1);
              }
              text = text.trimEnd() + "…";
            }
            cell.text = [text];
          }
        },
      });

      const blob = doc.output("blob");
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } finally {
      setPdfLoading(false);
    }
  };

  const clearSearch = useCallback(() => {
    setSearch("");
    setPage(1);
  }, []);

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
              options={stores.map((s) => ({
                value: s.store_code,
                label: `${s.store_code} - ${s.store_name}`,
              }))}
              value={fStores}
              onChange={setStores}
            />
          </div>
          <div>
            <Label className="text-xs">Departamento</Label>
            <MultiSelect
              single
              label="Selecione"
              options={deptosOpts.map((d) => ({ value: d, label: d }))}
              value={fDeptos}
              onChange={setDeptos}
            />
          </div>

          <div>
            <Label className="text-xs">Seção</Label>
            <MultiSelect
              label="Todas"
              options={secoesOpts.map((s) => ({ value: s, label: s }))}
              value={fSecoes}
              onChange={setSecoes}
            />
          </div>
          <div>
            <Label className="text-xs">Grupo</Label>
            <MultiSelect
              label="Todos"
              options={gruposOpts.map((g) => ({ value: g, label: g }))}
              value={fGrupos}
              onChange={setGrupos}
            />
          </div>
          <div className="md:col-span-2">
            <Label className="text-xs">Subgrupo</Label>
            <MultiSelect
              label="Todos"
              options={subgruposOpts.map((s) => ({ value: s, label: s }))}
              value={fSubgrupos}
              onChange={setSubgrupos}
            />
          </div>
        </div>
      </div>

      {!ready ? (
        <div className="kpi-card text-center text-muted-foreground">
          {!dateFrom || !dateTo
            ? "Selecione um período para iniciar a análise."
            : "Selecione ao menos uma Loja e um Departamento para iniciar a análise."}
        </div>
      ) : isError ? (
        <div className="kpi-card text-center">
          <p className="text-sm text-destructive mb-3">
            Não foi possível carregar a análise: {(error as Error)?.message ?? "erro desconhecido"}.
          </p>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            Tentar novamente
          </Button>
        </div>
      ) : isLoading ? (
        <>
          <section className="mb-4 grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="kpi-card">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="mt-2 h-8 w-28" />
              </div>
            ))}
          </section>
          <div className="kpi-card min-w-0">
            <div className="mb-3 flex items-center gap-2">
              <Skeleton className="h-5 w-44" />
              <div className="ml-auto flex items-center gap-2">
                <Skeleton className="h-9 w-40 rounded-md" />
                <Skeleton className="h-9 w-[110px] rounded-md" />
                <Skeleton className="h-9 w-16 rounded-md" />
              </div>
            </div>
            <div className="space-y-2">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-8 w-full" />
              ))}
            </div>
          </div>
        </>
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
                  <Search className="size-3.5 text-muted-foreground shrink-0" />
                  <Input
                    placeholder="Buscar PLU ou descrição…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="h-7 w-40 sm:w-56 border-0 px-1 text-sm shadow-none focus-visible:ring-1 focus-visible:ring-ring"
                  />
                  {search && (
                    <button
                      onClick={clearSearch}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <X className="size-3.5" />
                    </button>
                  )}
                </div>
                <Select
                  value={String(pageSize)}
                  onValueChange={(v) => setPageSize(Number(v) as 25 | 50 | 100 | 250)}
                >
                  <SelectTrigger className="h-9 w-[110px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="25">25 / página</SelectItem>
                    <SelectItem value="50">50 / página</SelectItem>
                    <SelectItem value="100">100 / página</SelectItem>
                    <SelectItem value="250">250 / página</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={openPdfInNewTab}
                  className="h-9"
                  disabled={pdfLoading}
                >
                  {pdfLoading ? (
                    <Loader2 className="mr-1.5 size-4 animate-spin" />
                  ) : (
                    <FileText className="mr-1.5 size-4" />
                  )}{" "}
                  PDF
                </Button>
              </div>
            </div>

            {/* Só 4 colunas agora: a tabela fica leve o suficiente para não
                precisar de scroll horizontal na maioria das telas. table-fixed
                garante que "Produto" trunque de forma previsível em vez de
                estourar a largura em nomes longos. */}
            <div className="overflow-x-auto -mx-3 px-3 sm:mx-0 sm:px-0">
              <table className="w-full min-w-[420px] table-fixed text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <Th
                      label="PLU"
                      k="prod_code"
                      sortKey={sortKey}
                      sortAsc={sortAsc}
                      toggle={toggleSort}
                      className="w-[18%]"
                    />
                    <Th
                      label="Produto"
                      k="prod_name"
                      sortKey={sortKey}
                      sortAsc={sortAsc}
                      toggle={toggleSort}
                      className="w-[42%]"
                    />
                    <Th
                      label="Venda"
                      k="val"
                      sortKey={sortKey}
                      sortAsc={sortAsc}
                      toggle={toggleSort}
                      align="right"
                      className="w-[20%]"
                    />
                    <Th
                      label="Dias S/ Venda"
                      k="daysSince"
                      sortKey={sortKey}
                      sortAsc={sortAsc}
                      toggle={toggleSort}
                      align="right"
                      className="w-[20%]"
                      hint={`Referência: ${baseDateIso ?? "—"}`}
                    />
                  </tr>
                </thead>
                <tbody>
                  {products.map((p) => {
                    const noSaleRow = p.val === 0;
                    return (
                      <tr
                        key={p.prod_code}
                        onClick={() => openProduct(p.prod_code)}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openProduct(p.prod_code); } }}
                        tabIndex={0}
                        role="button"
                        className={`cursor-pointer border-b border-border/60 hover:bg-muted/40 ${noSaleRow ? "bg-warning/10" : ""}`}
                        title="Abrir Análise de Produto"
                      >
                        <td className="py-3 md:py-2 font-mono text-xs whitespace-nowrap truncate">
                          {p.prod_code}
                        </td>
                        <td className="py-3 md:py-2 truncate">{p.prod_name}</td>
                        <td className="num py-3 md:py-2 text-right whitespace-nowrap font-medium">
                          {fmtBRL(p.val)}
                        </td>
                        <td className="num py-3 md:py-2 text-right whitespace-nowrap text-muted-foreground">
                          {daysSinceLabel(p.lastSaleDate)}
                        </td>
                      </tr>
                    );
                  })}
                  {products.length === 0 && !isFetching && (
                    <tr>
                      <td colSpan={4} className="py-8 text-center text-sm text-muted-foreground">
                        Nenhum produto encontrado.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
              <div>
                Exibindo {totalRows === 0 ? 0 : (page - 1) * pageSize + 1}–
                {Math.min(page * pageSize, totalRows)} de {fmtInt(totalRows)} produtos
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage(page - 1)}
                >
                  <ChevronLeft className="size-4" />
                </Button>
                <span>
                  Página {page} de {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage(page + 1)}
                >
                  <ChevronRight className="size-4" />
                </Button>
              </div>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Linhas em amarelo indicam produtos sem venda no período. Clique em uma linha para
              abrir a Análise de Produto.
            </p>
          </div>
        </>
      )}
    </div>
  );
}

function Th({
  label,
  k,
  sortKey,
  sortAsc,
  toggle,
  align = "left",
  className = "",
  hint,
}: {
  label: string;
  k: SortKey;
  sortKey: SortKey;
  sortAsc: boolean;
  toggle: (k: SortKey) => void;
  align?: "left" | "right";
  className?: string;
  hint?: string;
}) {
  const active = sortKey === k;
  return (
    <th className={`py-2 ${align === "right" ? "text-right" : ""} ${className}`}>
      <button
        onClick={() => toggle(k)}
        title={hint}
        className={`inline-flex items-center gap-1 hover:text-foreground ${align === "right" ? "flex-row-reverse" : ""} ${active ? "text-foreground" : ""}`}
      >
        {label}
        {active &&
          (sortAsc ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />)}
      </button>
    </th>
  );
}
