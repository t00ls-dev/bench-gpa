import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getProductionForecast, getProductionFilterOptions } from "@/lib/production.functions";
import { getStores } from "@/lib/dashboard.functions";
import { QUERY_STALE_REFERENCE, QUERY_STALE_CORE } from "@/lib/query-config";
import { ProductionFilters } from "@/components/production-filters";
import { ProductionTable } from "@/components/production-table";
import { ClipboardList } from "lucide-react";
import { Route } from "./producao";

function ProductionPage() {
  const { store, targetDate: initialTargetDate } = Route.useSearch();
  const [storeCode, setStoreCode] = useState<string | undefined>(store);
  const [targetDate, setTargetDate] = useState<string | undefined>(initialTargetDate);
  const [secoes, setSecoes] = useState<string[]>([]);
  const [grupos, setGrupos] = useState<string[]>([]);
  const [productFilter, setProductFilter] = useState("");

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

  return (
    <div>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold flex items-center gap-2">
            <ClipboardList className="size-7 text-primary shrink-0" /> Planejamento de Produção
          </h1>
          <p className="text-sm text-muted-foreground">
            Venda esperada por produto de Perecíveis, numa loja, para um dia futuro. Baseado na
            média das últimas ocorrências do mesmo dia da semana.
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
        productFilter={productFilter}
        onStoreChange={(v) => {
          setStoreCode(v[0]);
          setSecoes([]);
          setGrupos([]);
        }}
        onTargetDateChange={setTargetDate}
        onSecoesChange={setSecoes}
        onGruposChange={setGrupos}
        onProductFilterChange={setProductFilter}
      />

      {!storeCode || !targetDate ? (
        <div className="kpi-card px-3 py-6 text-center text-sm text-muted-foreground">
          Selecione uma loja e um dia futuro para ver a previsão.
        </div>
      ) : isError ? (
        <div className="kpi-card px-3 py-6 text-center text-sm text-destructive">
          {error instanceof Error ? error.message : "Erro ao carregar a previsão."}
        </div>
      ) : (
        <>
          {data && (
            <p className="mb-2 text-xs text-muted-foreground">
              Com base nas últimas {data.lookbackOccurrences} ocorrências deste dia da semana
              (mínimo de {data.minOccurrences} vendas para entrar individualmente).
            </p>
          )}
          <ProductionTable
            secoes={data?.secoes ?? []}
            isFetching={isFetching}
            productFilter={productFilter}
          />
        </>
      )}
    </div>
  );
}

export default ProductionPage;
