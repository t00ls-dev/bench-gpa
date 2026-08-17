import { useServerFn } from "@tanstack/react-start";
import { getAreaAnalysis } from "@/lib/area.functions";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AreaTable } from "@/components/area-table";
import { AreaKpiCards } from "@/components/area-kpi-cards";
import { AreaFilters } from "@/components/area-filters";
import { Layers } from "lucide-react";
import { Route } from "./area";
import { useAreaProductsView } from "@/hooks/use-area-products-view";
import { useAreaPdfExport } from "@/hooks/use-area-pdf-export";
import type { PAGE_SIZE_OPTIONS } from "@/lib/schemas";

function AreaPage() {
  const getArea = useServerFn(getAreaAnalysis);
  const searchParams = Route.useSearch();

  const view = useAreaProductsView(getArea, searchParams);
  const {
    af,
    setStores,
    setDeptos,
    setSecoes,
    setGrupos,
    setSubgrupos,
    setRange,
    dateFrom,
    dateTo,
    fStores,
    fDeptos,
    fSecoes,
    fGrupos,
    fSubgrupos,
    hierarchy,
    opts,
    baseDateIso,
    daysSinceLabel,
    ready,
    search,
    setSearch,
    sortKey,
    sortAsc,
    sortDir,
    toggleSort,
    pageSize,
    setPageSize,
    page,
    setPage,
    data,
    isFetching,
    isLoading,
    isError,
    error,
    refetch,
    products,
    total,
    noSale,
    totalRows,
    totalPages,
    daysSinceNum,
    pathParts,
  } = view;

  const { pdfLoading, pdfElapsed, openPdfInNewTab } = useAreaPdfExport({
    getArea,
    af,
    search,
    sortKey,
    sortDir,
    daysSinceNum,
    daysSinceLabel,
    total,
    noSale,
    pathParts,
    plusTotal: data?.plusTotal ?? 0,
    plusWithSale: data?.plusWithSale ?? 0,
    avgPerPlu: data?.avgPerPlu ?? 0,
    visibleProducts: products,
  });

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
            onPageSizeChange={(v) => setPageSize(v as (typeof PAGE_SIZE_OPTIONS)[number])}
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
