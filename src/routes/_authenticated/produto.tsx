import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useRef, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { searchProducts, getProductAnalysis, getProductByCode } from "@/lib/product.functions";
import { getStores } from "@/lib/dashboard.functions";
import { Label } from "@/components/ui/label";
import { MultiSelect } from "@/components/multi-select";
import { ProductSearch } from "@/components/product-search";
import { ProductKPIs } from "@/components/product-kpis";
import { ProductHierarchyTrail } from "@/components/product-hierarchy-trail";
import { Skeleton } from "@/components/ui/skeleton";
import { Package, Loader2 } from "lucide-react";

const WEEKDAYS_FULL = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];
const WEEKDAYS_PLURAL = ["Domingos", "Segundas-feiras", "Terças-feiras", "Quartas-feiras", "Quintas-feiras", "Sextas-feiras", "Sábados"];
const WEEKDAY_IS_MASC = [true, false, false, false, false, false, true];

interface SeriesPoint {
  date: string;
  val: number;
}

export const Route = createFileRoute("/_authenticated/produto")({
  validateSearch: (s: Record<string, unknown>) => ({
    plu: typeof s.plu === "string" ? s.plu : undefined,
    store: typeof s.store === "string" ? s.store : undefined,
  }),
  component: ProdutoPage,
});

function ProdutoPage() {
  const { plu, store } = Route.useSearch();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<{ prod_code: string; prod_name: string } | null>(null);
  const [debounced, setDebounced] = useState("");
  const [storeCode, setStoreCode] = useState<string>(store ?? "__all__");
  const tRef = useRef<number | null>(null);

  const getProductByCodeFn = useServerFn(getProductByCode);

  const { data: productByCode, isFetching: fetchingProductByCode } = useQuery({
    queryKey: ["product-by-code", plu],
    queryFn: () => getProductByCodeFn({ data: { prodCode: plu! } }),
    enabled: !!plu && !selected,
    staleTime: 10 * 60_000,
  });

  useEffect(() => {
    if (plu && productByCode) setSelected(productByCode);
    else if (plu && !fetchingProductByCode && !productByCode)
      setSelected({ prod_code: plu, prod_name: plu });
  }, [plu, productByCode, fetchingProductByCode]);

  useEffect(() => {
    if (tRef.current) window.clearTimeout(tRef.current);
    tRef.current = window.setTimeout(() => setDebounced(query), 250);
  }, [query]);

  const search = useServerFn(searchProducts);
  const analysis = useServerFn(getProductAnalysis);
  const getStoresFn = useServerFn(getStores);

  const { data: stores = [] } = useQuery({
    queryKey: ["stores-all"],
    queryFn: () => getStoresFn({}),
    staleTime: 10 * 60_000,
  });

  const { data: suggestions, isFetching: searchFetching } = useQuery({
    queryKey: ["product-search", debounced],
    queryFn: () => search({ data: { q: debounced } }),
    enabled: debounced.length >= 3 && !selected,
  });

  const { data: analysisData, isFetching: analysisLoading } = useQuery({
    queryKey: ["product-analysis", selected?.prod_code, storeCode],
    queryFn: () => analysis({ data: { prodCode: selected!.prod_code, storeCode: storeCode === "__all__" ? null : storeCode, referenceDate: null } }),
    enabled: !!selected,
    staleTime: 5 * 60_000,
  });

  const refWeekdayIdx = analysisData?.refDate ? new Date(analysisData.refDate + "T00:00:00Z").getUTCDay() : null;
  const refWeekdayFull = refWeekdayIdx != null ? WEEKDAYS_FULL[refWeekdayIdx] : null;
  const refWeekdayPlural = refWeekdayIdx != null ? WEEKDAYS_PLURAL[refWeekdayIdx] : null;
  const refArticle = refWeekdayIdx != null ? (WEEKDAY_IS_MASC[refWeekdayIdx] ? "Últimos" : "Últimas") : "Últimas";

  const sameWeekdayAll = useMemo<SeriesPoint[]>(() => {
    if (!analysisData?.evolution || refWeekdayIdx == null) return [];
    return (analysisData.evolution as SeriesPoint[])
      .filter((d) => new Date(d.date + "T00:00:00Z").getUTCDay() === refWeekdayIdx)
      .sort((a, b) => (a.date < b.date ? 1 : -1));
  }, [analysisData?.evolution, refWeekdayIdx]);

  const avgSame = sameWeekdayAll.length ? sameWeekdayAll.reduce((a, b) => a + b.val, 0) / sameWeekdayAll.length : 0;
  const avgDaily = useMemo(() => {
    const ev = (analysisData?.evolution as SeriesPoint[] | undefined) ?? [];
    return ev.length ? ev.reduce((a, b) => a + b.val, 0) / ev.length : 0;
  }, [analysisData?.evolution]);

  const handleClear = () => { setQuery(""); setSelected(null); setDebounced(""); };
  const handleSelect = (s: { prod_code: string; prod_name: string }) => { setSelected(s); setQuery(""); };

  return (
    <div>
      <header className="mb-6">
        <h1 className="font-display text-3xl font-bold flex items-center gap-2">
          <Package className="size-7 text-primary shrink-0" /> Análise de Produto
        </h1>
        <p className="text-sm text-muted-foreground">
          Pesquise um produto para ver comparações entre lojas, evolução e benchmarks semanais.
        </p>
      </header>

      <div className="kpi-card mb-4 min-w-0 overflow-hidden grid gap-3 md:grid-cols-2 [&>*]:min-w-0">
        <div>
          <Label className="text-xs">Loja</Label>
          <MultiSelect
            single label="Selecione"
            options={[
              { value: "__all__", label: "Todas as lojas" },
              ...stores.map((s) => ({ value: s.store_code, label: `${s.store_code} - ${s.store_name}` })),
            ]}
            value={[storeCode]}
            onChange={(v) => setStoreCode(v[0] ?? "__all__")}
          />
        </div>
      </div>

      <ProductSearch
        query={query} debounced={debounced} selected={selected}
        suggestions={suggestions} searchFetching={searchFetching}
        onQueryChange={(v) => { setQuery(v); setSelected(null); }}
        onSelect={handleSelect}
        onClear={handleClear}
      />

      {selected && (
        <div className="mt-2 flex flex-wrap items-center gap-2 px-1">
          <ProductHierarchyTrail product={analysisData?.product} />
        </div>
      )}

      {selected && analysisLoading && !analysisData && (
        <>
          <section className="mt-6 grid gap-4 md:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="kpi-card">
                <Skeleton className="h-3 w-24" /><Skeleton className="mt-2 h-8 w-28" /><Skeleton className="mt-2 h-3 w-20" />
              </div>
            ))}
          </section>
          <section className="mt-6 grid gap-4 lg:grid-cols-2">
            {Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="kpi-card">
                <Skeleton className="h-5 w-48" /><Skeleton className="mt-2 h-3 w-64" /><Skeleton className="mt-4 h-72 w-full rounded-lg" />
              </div>
            ))}
          </section>
        </>
      )}

      {selected && !analysisLoading && !analysisData && (
        <div className="kpi-card text-center py-10 mt-6">
          <p className="text-sm text-muted-foreground">
            Nenhum dado de venda encontrado para este produto no período disponível.
          </p>
        </div>
      )}

      {selected && analysisData && (
        <ProductKPIs
          analysisData={analysisData}
          avgSame={avgSame} avgDaily={avgDaily}
          refWeekdayFull={refWeekdayFull} refWeekdayPlural={refWeekdayPlural}
          refArticle={refArticle} sameWeekdayAll={sameWeekdayAll}
          hideStoreComp={storeCode !== "__all__"}
        />
      )}

      {!selected && fetchingProductByCode && (
        <div className="mt-12 flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Carregando produto…
        </div>
      )}
      {!selected && !fetchingProductByCode && (
        <div className="mt-12 text-center text-sm text-muted-foreground">
          Use a busca acima para começar.
        </div>
      )}
    </div>
  );
}
