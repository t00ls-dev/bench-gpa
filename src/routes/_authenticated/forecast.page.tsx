import { useEffect, useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getProductionForecast, getProductionFilterOptions } from "@/lib/production.functions";
import { getStores } from "@/lib/dashboard.functions";
import { QUERY_STALE_REFERENCE, QUERY_STALE_CORE } from "@/lib/query-config";
import { usePersistentState } from "@/hooks/use-persistent-state";
import { useProductionPdfExport } from "@/hooks/use-production-pdf-export";
import {
  applyForecastSearch,
  forecastProductsForSubgroups,
  setForecastStore,
  setForecastTargetDate,
  type ForecastFilters,
} from "@/lib/forecast-filters";
import { ProductionFilters } from "@/components/production-filters";
import { ProductionTable } from "@/components/production-table";
import type { MSOption } from "@/components/multi-select";
import { ClipboardList } from "lucide-react";
import { Route } from "./forecast";

function ProductionPage() {
  const { store, targetDate: initialTargetDate } = Route.useSearch();

  const [ff, setFf] = usePersistentState<ForecastFilters>("bench-gpa:filters:forecast:v1", {
    storeCode: undefined,
    targetDate: undefined,
    secao: undefined,
    grupos: [],
    subgrupos: [],
    productFilter: [],
  });
  const patch = (p: Partial<ForecastFilters>) => setFf((prev) => ({ ...prev, ...p }));
  const { storeCode, targetDate, secao, grupos, subgrupos, productFilter } = ff;

  // Deep link / hotkey navigation (?store=&targetDate=) takes over the
  // persisted filters once per visit, same spirit as Area's dashboard
  // click-through (useAreaProductsView's appliedSearchRef) -- must not
  // reapply if the user changes the filters afterward.
  const appliedSearchRef = useRef(false);
  useEffect(() => {
    if (appliedSearchRef.current) return;
    if (!store && !initialTargetDate) return;
    appliedSearchRef.current = true;
    setFf((prev) => applyForecastSearch(prev, { store, targetDate: initialTargetDate }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, initialTargetDate]);

  const getStoresFn = useServerFn(getStores);
  const { data: stores = [] } = useQuery({
    queryKey: ["stores-all"],
    queryFn: () => getStoresFn({}),
    staleTime: QUERY_STALE_REFERENCE,
  });

  const filterOptionsFn = useServerFn(getProductionFilterOptions);
  const { data: filterOptions = [] } = useQuery({
    queryKey: ["production-filter-options", storeCode],
    queryFn: () => filterOptionsFn({ data: { storeCode: storeCode! } }),
    enabled: !!storeCode,
    staleTime: QUERY_STALE_REFERENCE,
  });

  const forecastFn = useServerFn(getProductionForecast);
  const { data, isFetching, isError, error, refetch } = useQuery({
    queryKey: ["production-forecast", storeCode, targetDate, secao, grupos],
    queryFn: () =>
      forecastFn({
        data: { storeCode: storeCode!, targetDate: targetDate!, secao, grupos },
      }),
    enabled: !!storeCode && !!targetDate && !!secao,
    staleTime: QUERY_STALE_CORE,
  });

  // Options for the Produto multiselect come from whatever the forecast
  // actually returned, not the full store catalog: it's the only list a
  // product can realistically be picked from (product_universe alone runs
  // into the thousands per store), and it already reflects the current
  // seção/grupo filters.
  const productOptions: MSOption[] = useMemo(() => {
    const seen = new Set<string>();
    const opts: Array<MSOption & { prodName: string }> = [];
    const produtos = forecastProductsForSubgroups(data?.secoes ?? [], subgrupos);
    for (const p of produtos) {
      if (seen.has(p.prodCode)) continue;
      seen.add(p.prodCode);
      opts.push({
        value: p.prodCode,
        label: `PLU ${p.prodCode} · ${p.prodName}`,
        prodName: p.prodName,
      });
    }
    // Sorted by name (what the user scans for), not by the PLU prefix in the label.
    return opts.sort((a, b) => a.prodName.localeCompare(b.prodName));
  }, [data, subgrupos]);

  const foundStore = stores.find((x) => x.store_code === storeCode);
  const storeLabel = foundStore
    ? `${foundStore.store_code} - ${foundStore.store_name}`
    : (storeCode ?? "");
  const { pdfLoading, pdfElapsed, openPdfInNewTab } = useProductionPdfExport({
    secoes: data?.secoes ?? [],
    productFilter,
    subgrupoFilter: subgrupos,
    storeLabel,
    targetDate: targetDate ?? "",
    lookbackOccurrences: data?.lookbackOccurrences ?? 0,
  });

  return (
    <div>
      <header className="mb-6">
        <h1 className="font-display flex items-center gap-2 text-3xl font-bold">
          <ClipboardList className="size-7 shrink-0 text-primary" /> Previsão de Venda
        </h1>
        <p className="text-sm text-muted-foreground">
          Venda esperada por produto de Perecíveis, numa loja, para um dia futuro (ou já passado,
          pra conferência). Baseado na média das últimas ocorrências do mesmo dia da semana antes
          dessa data.
        </p>
      </header>

      <ProductionFilters
        stores={stores}
        storeCode={storeCode}
        targetDate={targetDate}
        filterOptions={filterOptions}
        secao={secao}
        grupos={grupos}
        subgrupos={subgrupos}
        productOptions={productOptions}
        productFilter={productFilter}
        onStoreChange={(v) => setFf((prev) => setForecastStore(prev, v[0]))}
        onTargetDateChange={(v) => setFf((prev) => setForecastTargetDate(prev, v))}
        onSecaoChange={(v) => patch({ secao: v[0], grupos: [], subgrupos: [], productFilter: [] })}
        onGruposChange={(v) => patch({ grupos: v, subgrupos: [], productFilter: [] })}
        onSubgruposChange={(v) => patch({ subgrupos: v, productFilter: [] })}
        onProductFilterChange={(v) => patch({ productFilter: v })}
      />

      {!storeCode || !targetDate || !secao ? (
        <div className="kpi-card px-3 py-6 text-center text-sm text-muted-foreground">
          Selecione ao menos uma Loja e uma Seção para iniciar a previsão.
        </div>
      ) : isError ? (
        <div className="kpi-card px-3 py-6 text-center">
          <p className="text-sm text-destructive mb-3">
            Não foi possível carregar a previsão:{" "}
            {error instanceof Error ? error.message : "erro desconhecido"}.
          </p>
          <button
            type="button"
            onClick={() => refetch()}
            className="inline-flex h-9 items-center justify-center rounded-md border border-input bg-background px-3 text-sm font-medium shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            Tentar novamente
          </button>
        </div>
      ) : (
        <>
          {data && (
            <p className="mb-4 text-sm text-muted-foreground">
              Com base nas últimas {data.lookbackOccurrences} ocorrências deste dia da semana.
            </p>
          )}
          <ProductionTable
            secoes={data?.secoes ?? []}
            isFetching={isFetching}
            productFilter={productFilter}
            subgrupoFilter={subgrupos}
            onExportPDF={openPdfInNewTab}
            pdfLoading={pdfLoading}
            pdfElapsed={pdfElapsed}
          />
        </>
      )}
    </div>
  );
}

export default ProductionPage;
