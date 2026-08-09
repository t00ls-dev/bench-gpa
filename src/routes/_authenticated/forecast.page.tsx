import { useEffect, useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getProductionForecast, getProductionFilterOptions } from "@/lib/production.functions";
import { getStores } from "@/lib/dashboard.functions";
import { QUERY_STALE_REFERENCE, QUERY_STALE_CORE } from "@/lib/query-config";
import { usePersistentState } from "@/hooks/use-persistent-state";
import { useProductionPdfExport } from "@/hooks/use-production-pdf-export";
import { cascadePatch } from "@/lib/filter-cascade";
import { ProductionFilters } from "@/components/production-filters";
import { ProductionTable } from "@/components/production-table";
import type { MSOption } from "@/components/multi-select";
import { ClipboardList } from "lucide-react";
import { Route } from "./forecast";

interface ForecastFilters {
  storeCode: string | undefined;
  targetDate: string | undefined;
  secoes: string[];
  grupos: string[];
  subgrupos: string[];
  productFilter: string[];
}

function ProductionPage() {
  const { store, targetDate: initialTargetDate } = Route.useSearch();

  const [ff, setFf] = usePersistentState<ForecastFilters>("bench-gpa:filters:forecast:v1", {
    storeCode: undefined,
    targetDate: undefined,
    secoes: [],
    grupos: [],
    subgrupos: [],
    productFilter: [],
  });
  const patch = (p: Partial<ForecastFilters>) => setFf((prev) => ({ ...prev, ...p }));
  const { storeCode, targetDate, secoes, grupos, subgrupos, productFilter } = ff;

  // Deep link / hotkey navigation (?store=&targetDate=) takes over the
  // persisted filters once per visit, same spirit as Area's dashboard
  // click-through (useAreaProductsView's appliedSearchRef) -- must not
  // reapply if the user changes the filters afterward.
  const appliedSearchRef = useRef(false);
  useEffect(() => {
    if (appliedSearchRef.current) return;
    if (!store && !initialTargetDate) return;
    appliedSearchRef.current = true;
    patch({
      storeCode: store ?? ff.storeCode,
      targetDate: initialTargetDate ?? ff.targetDate,
    });
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
  const { data, isFetching, isError, error } = useQuery({
    queryKey: ["production-forecast", storeCode, targetDate, secoes, grupos],
    queryFn: () =>
      forecastFn({
        data: { storeCode: storeCode!, targetDate: targetDate!, secoes, grupos },
      }),
    enabled: !!storeCode && !!targetDate,
    staleTime: QUERY_STALE_CORE,
    placeholderData: (prev) => prev,
  });

  // Options for the Produto multiselect come from whatever the forecast
  // actually returned, not the full store catalog: it's the only list a
  // product can realistically be picked from (product_universe alone runs
  // into the thousands per store), and it already reflects the current
  // seção/grupo filters.
  const productOptions: MSOption[] = useMemo(() => {
    const seen = new Set<string>();
    const opts: Array<MSOption & { prodName: string }> = [];
    const produtos = (data?.secoes ?? []).flatMap((s) => s.produtos);
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
  }, [data]);

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
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold flex items-center gap-2">
            <ClipboardList className="size-7 text-primary shrink-0" /> Previsão de Venda
          </h1>
          <p className="text-sm text-muted-foreground">
            Venda esperada por produto de Perecíveis, numa loja, para um dia futuro (ou já passado,
            pra conferência). Baseado na média das últimas ocorrências do mesmo dia da semana antes
            dessa data.
          </p>
        </div>
      </header>

      <ProductionFilters
        stores={stores}
        storeCode={storeCode}
        targetDate={targetDate}
        filterOptions={filterOptions}
        secoes={secoes}
        grupos={grupos}
        subgrupos={subgrupos}
        productOptions={productOptions}
        productFilter={productFilter}
        onStoreChange={(v) =>
          patch({ storeCode: v[0], productFilter: [], ...cascadePatch("secoes", []) })
        }
        onTargetDateChange={(v) => patch({ targetDate: v, productFilter: [] })}
        onSecoesChange={(v) => patch(cascadePatch("secoes", v))}
        onGruposChange={(v) => patch(cascadePatch("grupos", v))}
        onSubgruposChange={(v) => patch({ subgrupos: v })}
        onProductFilterChange={(v) => patch({ productFilter: v })}
      />

      {!storeCode || !targetDate ? (
        <div className="kpi-card px-3 py-6 text-center text-sm text-muted-foreground">
          Selecione uma loja e um dia para ver a previsão.
        </div>
      ) : isError ? (
        <div className="kpi-card px-3 py-6 text-center text-sm text-destructive">
          {error instanceof Error ? error.message : "Erro ao carregar a previsão."}
        </div>
      ) : (
        <>
          {data && (
            <p className="mb-2 text-xs text-muted-foreground">
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
