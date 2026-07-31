import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getAreaAnalysis, getAreaFilterHierarchy } from "@/lib/area.functions";
import { EXPORT_PAGE_SIZE, AREA_PAGE_SIZE_OPTIONS } from "@/lib/schemas";
import { Button } from "@/components/ui/button";
import { fmtBRL, fmtInt } from "@/lib/utils";
import { usePersistentState } from "@/hooks/use-persistent-state";
import { useElapsedSeconds } from "@/hooks/use-elapsed-seconds";
import { QUERY_STALE_CORE, QUERY_STALE_REFERENCE, QUERY_GC_REFERENCE } from "@/lib/query-config";
import { fmtBRShort } from "@/lib/utils";
import { openPdfBlob, slugifyFilename } from "@/lib/export-pdf";
import { Skeleton } from "@/components/ui/skeleton";
import { AreaTable } from "@/components/area-table";
import { AreaKpiCards } from "@/components/area-kpi-cards";
import { AreaFilters } from "@/components/area-filters";
import { Layers, Loader2 } from "lucide-react";
import { Route } from "./area";
import { defaultDateWindow } from "@/lib/date-window";
import { cascadePatch } from "@/lib/filter-cascade";

type Product = {
  prod_code: string;
  prod_name: string;
  depto: string | null;
  secao: string | null;
  grupo: string | null;
  subgrupo: string | null;
  val: number;
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

const isoDate = /^\d{4}-\d{2}-\d{2}$/;
function sanitizeAF(f: AF): AF {
  let dateFrom = isoDate.test(f.dateFrom) ? f.dateFrom : "";
  let dateTo = isoDate.test(f.dateTo) ? f.dateTo : "";
  // Guard against a reversed range (e.g. persisted from an old session) —
  // it makes queries return no data and crashes the calendar picker.
  if (dateFrom && dateTo && dateFrom > dateTo) [dateFrom, dateTo] = [dateTo, dateFrom];
  return { ...f, dateFrom, dateTo };
}

function AreaPage() {
  const getHierarchy = useServerFn(getAreaFilterHierarchy);
  const getArea = useServerFn(getAreaAnalysis);

  const [af, setAf] = usePersistentState<AF>(
    "bench-gpa:filters:area:v2",
    {
      dateFrom: "",
      dateTo: "",
      stores: [],
      deptos: [],
      secoes: [],
      grupos: [],
      subgrupos: [],
    },
    sanitizeAF,
  );
  // Atualização funcional de propósito: se dois efeitos chamarem patch() no
  // mesmo commit (ex.: hierarquia já em cache faz o efeito de período padrão
  // e o de click-through do Dashboard disputarem o primeiro render), cada
  // `setAf({...af, ...p})` calculado a partir do MESMO `af` (fechamento
  // parado no render anterior) apaga o patch do outro — só o último a
  // "vencer" sobrevive. `setAf(prev => ...)` sempre parte do estado mais
  // recente, mesmo entre updates do mesmo commit.
  const patch = (p: Partial<AF>) => setAf((prev) => ({ ...prev, ...p }));
  const setStores = (v: string[]) => patch(cascadePatch("stores", v));
  const setDeptos = (v: string[]) => patch(cascadePatch("deptos", v));
  const setSecoes = (v: string[]) => patch(cascadePatch("secoes", v));
  const setGrupos = (v: string[]) => patch(cascadePatch("grupos", v));
  const setSubgrupos = (v: string[]) => patch({ subgrupos: v });
  const setRange = (r: { from: string; to: string }) => patch({ dateFrom: r.from, dateTo: r.to });

  // Click-through do ranking do Dashboard (?store=&depto=&secao=&grupo=&subgrupo=):
  // substitui os filtros de categoria persistidos pelo nível clicado, uma
  // única vez por navegação — não deve reaplicar se o usuário mudar os
  // filtros depois (por isso o guard em ref em vez de rodar a cada render).
  const searchParams = Route.useSearch();
  const appliedSearchRef = useRef(false);
  useEffect(() => {
    if (appliedSearchRef.current) return;
    const { store, depto, secao, grupo, subgrupo } = searchParams;
    if (!store && !depto && !secao && !grupo && !subgrupo) return;
    appliedSearchRef.current = true;
    patch({
      stores: store ? [store] : af.stores,
      deptos: depto ? [depto] : [],
      secoes: secao ? [secao] : [],
      grupos: grupo ? [grupo] : [],
      subgrupos: subgrupo ? [subgrupo] : [],
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

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
    staleTime: QUERY_STALE_REFERENCE,
    gcTime: QUERY_GC_REFERENCE,
  });
  const hierData = hierQ.data;
  // useMemo porque o `?? []` criava um array novo a cada render, e `hierarchy` é
  // dependência do useMemo de `stores` — que portanto recalculava sempre.
  const hierarchy = useMemo(() => hierData?.hierarchy ?? [], [hierData]);
  const opts = hierData;

  const baseDateIso = dateTo || opts?.latestDate || undefined;
  // useCallback para poder entrar como dependência do useMemo de `products` sem
  // recriar a função (e invalidar o memo) a cada render.
  const daysSinceNum = useCallback(
    (iso: string | null): number | null => {
      if (!iso || !baseDateIso) return null;
      return Math.floor(
        (new Date(baseDateIso + "T00:00:00").getTime() - new Date(iso + "T00:00:00").getTime()) /
          86400000,
      );
    },
    [baseDateIso],
  );
  const daysSinceLabel = (iso: string | null): string => {
    const n = daysSinceNum(iso);
    return n === null ? "-" : String(n);
  };

  useEffect(() => {
    if (opts?.latestDate && (!dateFrom || !dateTo)) {
      const avail = (opts?.availableDates ?? []) as string[];
      const win = defaultDateWindow(avail, opts.latestDate);
      if (win) setRange(win);
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
  const [pageSize, setPageSize] = useState<(typeof AREA_PAGE_SIZE_OPTIONS)[number]>(50);
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
    staleTime: QUERY_STALE_CORE,
    retry: 1,
    placeholderData: (prev) => prev,
  });

  const products = useMemo(() => {
    const raw = (data?.products ?? []) as Product[];
    if (sortKey !== "daysSince") return raw;
    return [...raw].sort((a, b) => {
      const aD = daysSinceNum(a.lastSaleDate);
      const bD = daysSinceNum(b.lastSaleDate);
      const aN = aD === null;
      const bN = bD === null;
      const cmp = aN && bN ? 0 : aN ? 1 : bN ? -1 : aD - bD;
      return sortAsc ? cmp : -cmp;
    });
  }, [data, sortKey, sortAsc, daysSinceNum]);
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

  const stores = useMemo(() => {
    const seen = new Set<string>();
    return hierarchy.filter((r) => {
      if (seen.has(r.store_code)) return false;
      seen.add(r.store_code);
      return true;
    });
  }, [hierarchy]);

  const pathParts: string[] = [];
  if (fStores.length === 0) pathParts.push("Todas as lojas");
  else if (fStores.length === 1) {
    const s = stores.find((x) => x.store_code === fStores[0]);
    pathParts.push("Loja " + (s ? s.store_code + " - " + s.store_name : fStores[0]));
  } else pathParts.push(fStores.length + " lojas");
  const summarize = (arr: string[], _one: string, many: string) =>
    arr.length === 1 ? arr[0] : arr.length > 1 ? arr.length + " " + many : null;
  const dp = summarize(fDeptos, "depto", "departamentos");
  if (dp) pathParts.push(dp);
  const sc = summarize(fSecoes, "seção", "seções");
  if (sc) pathParts.push(sc);
  const gp = summarize(fGrupos, "grupo", "grupos");
  if (gp) pathParts.push(gp);
  const sg = summarize(fSubgrupos, "subgrupo", "subgrupos");
  if (sg) pathParts.push(sg);

  const [pdfLoading, setPdfLoading] = useState(false);
  const pdfElapsed = useElapsedSeconds(pdfLoading);

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
          page: 1,
          // O PDF precisa da listagem inteira, não da página exibida. O valor
          // vem de schemas.ts porque três coisas dependem dele ao mesmo tempo:
          // o teto do AreaAnalysisSchema, o limiar que mantém esta resposta
          // fora do cache (area.functions.ts) e o tamanho do universo de PLUs.
          pageSize: EXPORT_PAGE_SIZE,
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
            const aD = daysSinceNum(a.lastSaleDate),
              bD = daysSinceNum(b.lastSaleDate);
            const aN = aD === null,
              bN = bD === null;
            if (aN && bN) cmp = 0;
            else if (aN) cmp = 1;
            else if (bN) cmp = -1;
            else cmp = aD - bD;
          }
          if (cmp === 0) cmp = a.prod_code.localeCompare(b.prod_code);
          return sortDir === "desc" ? -cmp : cmp;
        });

      const jsPDF = (await import("jspdf")).default;
      const autoTable = (await import("jspdf-autotable")).default;
      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const mX = 10;

      doc.setFont("helvetica", "bold");
      doc.setFontSize(14);
      doc.setTextColor(17, 17, 17);
      doc.text("Análise de Área", mX, 12);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(85, 85, 85);
      doc.text("Área: " + area, mX, 18);
      doc.text("Período: " + fmtBRShort(dateFrom) + " - " + fmtBRShort(dateTo), mX, 22.5);
      doc.text("Produtos listados: " + filtered.length, mX, 27);

      // Experimental (item 6 do backlog de UX) — mesmos 5 números do
      // AreaKpiCards no topo da tela, só que impressos no PDF.
      autoTable(doc, {
        startY: 31,
        margin: { left: mX, right: mX },
        head: [["VENDA TOTAL", "PLUS (ÁREA)", "PLUS C/ VENDA", "PLUS S/ VENDA", "VENDA MÉDIA/PLU"]],
        body: [
          [
            fmtBRL(total),
            fmtInt(data?.plusTotal ?? 0),
            fmtInt(data?.plusWithSale ?? 0),
            fmtInt(noSale),
            fmtBRL(data?.avgPerPlu ?? 0),
          ],
        ],
        theme: "grid",
        styles: {
          font: "helvetica",
          fontSize: 8,
          cellPadding: 2,
          halign: "center",
          lineColor: [153, 153, 153],
          lineWidth: 0.1,
          textColor: [17, 17, 17],
        },
        headStyles: {
          fillColor: [238, 238, 255],
          textColor: [17, 17, 17],
          fontStyle: "bold",
          fontSize: 7,
        },
      });
      const kpiEndY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable
        .finalY;

      autoTable(doc, {
        startY: kpiEndY + 4,
        margin: { left: mX, right: mX },
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
        didParseCell: (h) => {
          if (h.section === "body" && (h.column.index === 4 || h.column.index === 5))
            h.cell.text = [];
        },
        willDrawCell: (h) => {
          if (h.section === "body" && h.column.index === 1) {
            const raw = Array.isArray(h.cell.text)
              ? h.cell.text.join(" ")
              : String(h.cell.text ?? "");
            const maxW = h.cell.width - h.cell.padding("horizontal");
            let t = raw;
            if (h.doc.getTextWidth(t) > maxW) {
              while (t.length > 1 && h.doc.getTextWidth(t + "...") > maxW) t = t.slice(0, -1);
              t = t.trimEnd() + "...";
            }
            h.cell.text = [t];
          }
        },
      });

      const filename = `analise-area-${slugifyFilename(area)}-${dateFrom}-a-${dateTo}.pdf`;
      openPdfBlob(doc, filename);
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

      <AreaFilters
        hierarchy={hierarchy}
        dateFrom={dateFrom}
        dateTo={dateTo}
        fStores={fStores}
        fDeptos={fDeptos}
        fSecoes={fSecoes}
        fGrupos={fGrupos}
        fSubgrupos={fSubgrupos}
        latestDate={opts?.latestDate ?? undefined}
        availableDates={opts?.availableDates ?? []}
        onRangeChange={setRange}
        onStoresChange={setStores}
        onDeptosChange={setDeptos}
        onSecoesChange={setSecoes}
        onGruposChange={setGrupos}
        onSubgruposChange={setSubgrupos}
      />

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
            storeCode={fStores.length === 1 ? fStores[0] : null}
            sortKey={sortKey}
            sortAsc={sortAsc}
            daysSinceLabel={daysSinceLabel}
            onSearchChange={setSearch}
            onClearSearch={() => {
              setSearch("");
              setPage(1);
            }}
            onPageSizeChange={(v) => setPageSize(v as (typeof AREA_PAGE_SIZE_OPTIONS)[number])}
            onPageChange={setPage}
            onSortToggle={toggleSort}
            onExportPDF={openPdfInNewTab}
            pdfLoading={pdfLoading}
            pdfElapsed={pdfElapsed}
          />
        </>
      )}
    </div>
  );
}

export default AreaPage;
