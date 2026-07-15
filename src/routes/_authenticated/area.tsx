import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getAreaAnalysis, getAreaFilterHierarchy } from "@/lib/area.functions";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { fmtBRL, fmtInt } from "@/components/kpi-card";
import { DateRangePicker } from "@/components/date-range-picker";
import { MultiSelect } from "@/components/multi-select";
import { usePersistentState } from "@/hooks/use-persistent-state";
import { fmtBRShort } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { AreaTable } from "@/components/area-table";
import { AreaKpiCards } from "@/components/area-kpi-cards";
import { Layers, Loader2 } from "lucide-react";

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

function AreaPage() {
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

  const deptoBase = useMemo(
    () =>
      fStores.length === 0 ? hierarchy : hierarchy.filter((r) => fStores.includes(r.store_code)),
    [hierarchy, fStores],
  );
  const deptosOpts = useMemo(
    () => [...new Set(deptoBase.map((r) => r.depto).filter(Boolean) as string[])].sort(),
    [deptoBase],
  );
  const secaoBase = useMemo(
    () =>
      fDeptos.length === 0
        ? deptoBase
        : deptoBase.filter((r) => r.depto && fDeptos.includes(r.depto)),
    [deptoBase, fDeptos],
  );
  const secoesOpts = useMemo(
    () => [...new Set(secaoBase.map((r) => r.secao).filter(Boolean) as string[])].sort(),
    [secaoBase],
  );
  const grupoBase = useMemo(
    () =>
      fSecoes.length === 0
        ? secaoBase
        : secaoBase.filter((r) => r.secao && fSecoes.includes(r.secao)),
    [secaoBase, fSecoes],
  );
  const gruposOpts = useMemo(
    () => [...new Set(grupoBase.map((r) => r.grupo).filter(Boolean) as string[])].sort(),
    [grupoBase],
  );
  const subgrupoBase = useMemo(
    () =>
      fGrupos.length === 0
        ? grupoBase
        : grupoBase.filter((r) => r.grupo && fGrupos.includes(r.grupo)),
    [grupoBase, fGrupos],
  );
  const subgruposOpts = useMemo(
    () => [...new Set(subgrupoBase.map((r) => r.subgrupo).filter(Boolean) as string[])].sort(),
    [subgrupoBase],
  );

  const opts = hierData;

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

  const ready = !!dateFrom && !!dateTo && fStores.length > 0 && fDeptos.length > 0;

  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("val");
  const [sortAsc, setSortAsc] = useState(false);
  const [pageSize, setPageSize] = useState<25 | 50 | 100 | 250>(50);
  const [page, setPage] = useState(1);

  const sortDir = sortAsc ? "desc" : "asc";

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
    staleTime: 5 * 60_000,
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

  const pathParts: string[] = [];
  if (fStores.length === 0) pathParts.push("Todas as lojas");
  else if (fStores.length === 1) {
    const s = stores.find((x) => x.store_code === fStores[0]);
    pathParts.push(`Loja ${s ? `${s.store_code} - ${s.store_name}` : fStores[0]}`);
  } else pathParts.push(`${fStores.length} lojas`);
  const summarize = (arr: string[], _one: string, many: string) =>
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
        },
      });
      const searchTerm = search.trim().toLowerCase();
      const filtered = [...(allData.products ?? [])]
        .filter(
          (p) =>
            !searchTerm ||
            p.prod_code.toLowerCase().includes(searchTerm) ||
            p.prod_name.toLowerCase().includes(searchTerm),
        )
        .sort((a, b) => {
          let cmp = 0;
          if (sortKey === "val") cmp = a.val - b.val;
          else if (sortKey === "prod_code") cmp = a.prod_code.localeCompare(b.prod_code);
          else if (sortKey === "prod_name") cmp = a.prod_name.localeCompare(b.prod_name);
          else if (sortKey === "daysSince") {
            const aDays = daysSinceNum(a.lastSaleDate);
            const bDays = daysSinceNum(b.lastSaleDate);
            const aIsNull = aDays === null;
            const bIsNull = bDays === null;
            if (aIsNull && bIsNull) cmp = 0;
            else if (aIsNull) cmp = 1;
            else if (bIsNull) cmp = -1;
            else cmp = aDays - bDays;
          }
          if (cmp === 0) cmp = a.prod_code.localeCompare(b.prod_code);
          return sortDir === "desc" ? -cmp : cmp;
        });

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
          )
            hookData.cell.text = [];
        },
        willDrawCell: (hookData) => {
          if (hookData.section === "body" && hookData.column.index === 1) {
            const cell = hookData.cell;
            const doc2 = hookData.doc;
            const raw = Array.isArray(cell.text) ? cell.text.join(" ") : String(cell.text ?? "");
            const maxWidth = cell.width - cell.padding("horizontal");
            let text = raw;
            if (doc2.getTextWidth(text) > maxWidth) {
              while (text.length > 1 && doc2.getTextWidth(text + "…") > maxWidth)
                text = text.slice(0, -1);
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

      <div className="kpi-card mb-4 space-y-3 min-w-0 overflow-hidden">
        <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-6 [&>*]:min-w-0">
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
          <AreaKpiCards
            total={total}
            plusTotal={data?.plusTotal ?? 0}
            plusWithSale={data?.plusWithSale ?? 0}
            noSale={noSale}
            avgPerPlu={data?.avgPerPlu ?? 0}
          />
          <AreaTable
            products={products}
            totalRows={totalRows}
            page={page}
            totalPages={totalPages}
            pageSize={pageSize}
            search={search}
            isFetching={isFetching}
            baseDateIso={baseDateIso}
            sortKey={sortKey}
            sortAsc={sortAsc}
            daysSinceLabel={daysSinceLabel}
            onSearchChange={setSearch}
            onClearSearch={() => {
              setSearch("");
              setPage(1);
            }}
            onPageSizeChange={(v) => setPageSize(v as 25 | 50 | 100 | 250)}
            onPageChange={setPage}
            onSortToggle={toggleSort}
            onExportPDF={openPdfInNewTab}
            pdfLoading={pdfLoading}
          />
        </>
      )}
    </div>
  );
}
