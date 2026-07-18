import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getDashboard, getDashboardRankings } from "@/lib/dashboard.functions";
import { FilterBar, type Filters } from "@/components/filter-bar";
import { FilterChips } from "@/components/filter-chips";
import { KpiCard } from "@/components/kpi-card";
import { fmtBRL } from "@/lib/utils";
import { RankingCard } from "@/components/ranking-card";
import { usePersistentState } from "@/hooks/use-persistent-state";
import { lazy, Suspense } from "react";
import { ErrorBoundary } from "@/components/error-boundary";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { FileText, LayoutDashboard, Loader2 } from "lucide-react";
import { fmtBRShort } from "@/lib/utils";
import { openPdfBlob } from "@/lib/export-pdf";
import { Route } from "./index";

const DashboardCharts = lazy(() =>
  import("@/components/dashboard-charts").then((m) => ({ default: m.DashboardCharts })),
);

const initial: Filters = {
  dateFrom: "",
  dateTo: "",
  stores: [],
  deptos: [],
  secoes: [],
  grupos: [],
  subgrupos: [],
  compare: "prev_period",
};

function Dashboard() {
  const [filters, setFilters] = usePersistentState<Filters>("bench-gpa:filters:dashboard", initial);
  const fn = useServerFn(getDashboard);
  const fnRank = useServerFn(getDashboardRankings);
  const enabled = !!filters.dateFrom && !!filters.dateTo;

  const { data, isFetching, isLoading } = useQuery({
    queryKey: ["dashboard", filters],
    queryFn: () => fn({ data: filters }),
    enabled,
    staleTime: 5 * 60_000,
    gcTime: 10 * 60_000,
    refetchOnWindowFocus: false,
    placeholderData: (prev) => prev,
  });

  const { data: rankings, isFetching: rankingLoading } = useQuery({
    queryKey: ["dashboard-rankings", filters],
    queryFn: () => fnRank({ data: { ...filters, limit: 10 } }),
    enabled,
    staleTime: 5 * 60_000,
    gcTime: 10 * 60_000,
    refetchOnWindowFocus: false,
    placeholderData: (prev) => prev,
  });

  const delta = (cur: number, prev: number | undefined) =>
    prev && prev > 0 ? (cur - prev) / prev : null;

  const hideStores = filters.stores.length === 1;
  const hideDepto = filters.deptos.length === 1;
  const hideSecao = filters.secoes.length === 1;
  const hideGrupo = filters.grupos.length === 1;
  const hideSubgrupo = filters.subgrupos.length === 1;

  const [pdfLoading, setPdfLoading] = useState(false);

  const openDashboardPdf = async () => {
    setPdfLoading(true);
    try {
      const jsPDF = (await import("jspdf")).default;
      const autoTable = (await import("jspdf-autotable")).default;
      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const mX = 10;
      let y = 12;

      doc.setFont("helvetica", "bold"); doc.setFontSize(16); doc.setTextColor(17, 17, 17);
      doc.text("Dashboard", mX, y); y += 7;
      doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(85, 85, 85);
      doc.text("Período: " + fmtBRShort(filters.dateFrom) + " — " + fmtBRShort(filters.dateTo), mX, y); y += 4;
      const parts: string[] = [];
      if (filters.stores.length) parts.push(filters.stores.length === 1 ? filters.stores[0] : filters.stores.length + " lojas");
      if (filters.deptos.length === 1) parts.push(filters.deptos[0]);
      if (filters.secoes.length === 1) parts.push(filters.secoes[0]);
      if (filters.grupos.length === 1) parts.push(filters.grupos[0]);
      if (parts.length) doc.text("Filtros: " + parts.join(", "), mX, y); y += 6;

      if (data?.current) {
        doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(17, 17, 17);
        doc.text("Venda total: " + fmtBRL(data.current.total), mX, y); y += 4.5;
        if (data.previous) {
          const d = data.current.total && data.previous.total ? (data.current.total - data.previous.total) / data.previous.total : null;
          doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(85, 85, 85);
          doc.text("Período anterior: " + fmtBRL(data.previous.total) + (d != null ? " (" + (d >= 0 ? "+" : "") + (d * 100).toFixed(1) + "%)" : ""), mX, y); y += 5;
        }
        y += 2;
      }

      const rankSections: { title: string; rows: string[][] }[] = [];
      if (!hideDepto && rankings?.byDepto?.length) rankSections.push({ title: "Top Departamentos", rows: rankings.byDepto.map((r) => [r.name ?? "", fmtBRL(r.val)]) });
      if (!hideSecao && rankings?.bySecao?.length) rankSections.push({ title: "Top Seções", rows: rankings.bySecao.map((r) => [r.name ?? "", fmtBRL(r.val)]) });
      if (!hideGrupo && rankings?.byGrupo?.length) rankSections.push({ title: "Top Grupos", rows: rankings.byGrupo.map((r) => [r.name ?? "", fmtBRL(r.val)]) });
      if (!hideSubgrupo && rankings?.bySubgrupo?.length) rankSections.push({ title: "Top Subgrupos", rows: rankings.bySubgrupo.map((r) => [r.name ?? "", fmtBRL(r.val)]) });
      if (rankings?.byProduto?.length) rankSections.push({ title: "Top Produtos", rows: rankings.byProduto.map((r) => [r.name ? r.code + " - " + r.name : r.code, fmtBRL(r.val)]) });

      for (const sec of rankSections) {
        if (y > 260) { doc.addPage(); y = 20; }
        autoTable(doc, {
          startY: y, margin: { left: mX, right: mX },
          head: [[sec.title, "Venda"]],
          body: sec.rows,
          theme: "grid",
          styles: { font: "helvetica", fontSize: 8, cellPadding: 1.5, overflow: "hidden", valign: "middle", lineColor: [153, 153, 153], lineWidth: 0.1, textColor: [17, 17, 17] },
          headStyles: { fillColor: [238, 238, 255], textColor: [17, 17, 17], fontStyle: "bold", fontSize: 8, halign: "center" },
          columnStyles: { 0: { cellWidth: 150 }, 1: { cellWidth: 40, halign: "right" } },
        });
        y = (doc as any).lastAutoTable.finalY + 6;
      }

      openPdfBlob(doc);
    } finally {
      setPdfLoading(false);
    }
  };

  return (
    <div>
      <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold flex items-center gap-2">
            <LayoutDashboard className="size-7 text-primary shrink-0" /> Dashboard
          </h1>
          <p className="text-sm text-muted-foreground">
            Visão geral de vendas por loja, departamento e período.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isFetching && <span className="text-xs text-muted-foreground">Atualizando…</span>}
          {data && (
            <Button variant="outline" size="sm" className="h-9" onClick={openDashboardPdf} disabled={pdfLoading}>
              {pdfLoading ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : <FileText className="mr-1.5 size-4" />}
              PDF
            </Button>
          )}
        </div>
      </header>

      <FilterBar value={filters} onChange={setFilters} />
      <FilterChips filters={filters} onChange={setFilters} />

      <section className="grid gap-4 sm:grid-cols-1">
        {isLoading ? (
          <div className="kpi-card">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="mt-2 h-8 w-40" />
            <Skeleton className="mt-2 h-3 w-32" />
          </div>
        ) : data && data.current.total === 0 ? (
          <div className="kpi-card text-center py-10">
            <p className="text-sm text-muted-foreground">
              Nenhuma venda encontrada para o período e filtros selecionados.
            </p>
          </div>
        ) : (
          <KpiCard
            label="Venda total"
            value={fmtBRL(data?.current.total ?? 0)}
            delta={data?.previous ? delta(data.current.total, data.previous.total) : null}
            hint={data?.previous ? `Anterior: ${fmtBRL(data.previous.total)}` : undefined}
          />
        )}
      </section>

      <Suspense
        fallback={
          <section className="mt-6 grid gap-4 lg:grid-cols-2">
            <div className="kpi-card">
              <Skeleton className="h-64 w-full rounded-lg" />
            </div>
            <div className="kpi-card">
              <Skeleton className="h-64 w-full rounded-lg" />
            </div>
          </section>
        }
      >
        <ErrorBoundary>
          <DashboardCharts data={data} isLoading={isLoading} hideStores={hideStores} />
        </ErrorBoundary>
      </Suspense>

      {hideDepto && hideSecao && hideGrupo && hideSubgrupo ? null : (
        <section className="mt-6 grid gap-4 lg:grid-cols-2">
          <ErrorBoundary>
            {hideDepto ? null : (
              <RankingCard
                title="Top Departamentos"
                items={rankings?.byDepto ?? []}
                isLoading={rankingLoading}
              />
            )}
          </ErrorBoundary>
          <ErrorBoundary>
            {hideSecao ? null : (
              <RankingCard
                title="Top Seções"
                items={rankings?.bySecao ?? []}
                isLoading={rankingLoading}
              />
            )}
          </ErrorBoundary>
          <ErrorBoundary>
            {hideGrupo ? null : (
              <RankingCard
                title="Top Grupos"
                items={rankings?.byGrupo ?? []}
                isLoading={rankingLoading}
              />
            )}
          </ErrorBoundary>
          <ErrorBoundary>
            {hideSubgrupo ? null : (
              <RankingCard
                title="Top Subgrupos"
                items={rankings?.bySubgrupo ?? []}
                isLoading={rankingLoading}
              />
            )}
          </ErrorBoundary>
        </section>
      )}

      <ErrorBoundary>
        <section className="mt-6">
          <RankingCard
            title="Top Produtos"
            items={rankings?.byProduto ?? []}
            isLoading={rankingLoading}
          />
        </section>
      </ErrorBoundary>
    </div>
  );
}

export default Dashboard;
