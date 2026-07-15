import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useRef, useMemo, lazy, Suspense } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { searchProducts, getProductAnalysis, getProductByCode } from "@/lib/product.functions";
import { getStores } from "@/lib/dashboard.functions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MultiSelect } from "@/components/multi-select";
import { KpiCard, fmtBRL } from "@/components/kpi-card";
import { ProductHierarchyTrail } from "@/components/product-hierarchy-trail";
import { PaginatedHistory } from "@/components/paginated-history";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, Package, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fmtBRShort } from "@/lib/utils";

const ProductCharts = lazy(() =>
  import("@/components/product-charts").then((m) => ({ default: m.ProductCharts })),
);

export const Route = createFileRoute("/_authenticated/produto")({
  validateSearch: (s: Record<string, unknown>) => ({
    plu: typeof s.plu === "string" ? s.plu : undefined,
    store: typeof s.store === "string" ? s.store : undefined,
  }),
  component: ProdutoPage,
});

const WEEKDAYS_FULL = [
  "Domingo",
  "Segunda-feira",
  "Terça-feira",
  "Quarta-feira",
  "Quinta-feira",
  "Sexta-feira",
  "Sábado",
];
const WEEKDAYS_PLURAL = [
  "Domingos",
  "Segundas-feiras",
  "Terças-feiras",
  "Quartas-feiras",
  "Quintas-feiras",
  "Sextas-feiras",
  "Sábados",
];
const WEEKDAY_IS_MASC = [true, false, false, false, false, false, true];

interface SeriesPoint {
  date: string;
  val: number;
}

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
    if (plu && productByCode) {
      setSelected(productByCode);
    } else if (plu && !fetchingProductByCode && !productByCode) {
      setSelected({ prod_code: plu, prod_name: plu });
    }
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
    queryFn: () =>
      analysis({
        data: {
          prodCode: selected!.prod_code,
          storeCode: storeCode === "__all__" ? null : storeCode,
          referenceDate: null,
        },
      }),
    enabled: !!selected,
  });

  const refWeekdayIdx = analysisData?.refDate
    ? new Date(analysisData.refDate + "T00:00:00Z").getUTCDay()
    : null;
  const refWeekdayFull = refWeekdayIdx != null ? WEEKDAYS_FULL[refWeekdayIdx] : null;
  const refWeekdayPlural = refWeekdayIdx != null ? WEEKDAYS_PLURAL[refWeekdayIdx] : null;
  const refArticle =
    refWeekdayIdx != null ? (WEEKDAY_IS_MASC[refWeekdayIdx] ? "Últimos" : "Últimas") : "Últimas";

  const sameWeekdayAll = useMemo<SeriesPoint[]>(() => {
    if (!analysisData?.evolution || refWeekdayIdx == null) return [];
    return (analysisData.evolution as SeriesPoint[])
      .filter((d) => new Date(d.date + "T00:00:00Z").getUTCDay() === refWeekdayIdx)
      .sort((a, b) => (a.date < b.date ? 1 : -1));
  }, [analysisData?.evolution, refWeekdayIdx]);

  const avgSame = sameWeekdayAll.length
    ? sameWeekdayAll.reduce((a, b) => a + b.val, 0) / sameWeekdayAll.length
    : 0;

  const avgDaily = useMemo(() => {
    const ev = (analysisData?.evolution as SeriesPoint[] | undefined) ?? [];
    return ev.length ? ev.reduce((a, b) => a + b.val, 0) / ev.length : 0;
  }, [analysisData?.evolution]);

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
            single
            label="Selecione"
            options={[
              { value: "__all__", label: "Todas as lojas" },
              ...stores.map((s) => ({
                value: s.store_code,
                label: `${s.store_code} - ${s.store_name}`,
              })),
            ]}
            value={[storeCode]}
            onChange={(v) => setStoreCode(v[0] ?? "__all__")}
          />
        </div>
      </div>

      <div className="kpi-card relative">
        <div className="flex items-center gap-2 flex-wrap">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <Input
            className="min-w-[180px] flex-1 border-0 shadow-none focus-visible:ring-1 focus-visible:ring-ring"
            placeholder="Digite ao menos 3 caracteres (nome ou código)…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelected(null);
            }}
            className="border-0 shadow-none focus-visible:ring-1 focus-visible:ring-ring"
          />
          {(query.length > 0 || selected) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setQuery("");
                setSelected(null);
                setDebounced("");
              }}
              className="h-7 gap-1 text-xs text-muted-foreground"
            >
              <X className="size-3" /> Limpar
            </Button>
          )}
          {selected && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setSelected(null);
                setQuery("");
                setDebounced("");
              }}
              className="h-7 text-xs"
            >
              Trocar produto
            </Button>
          )}
        </div>
        {selected && (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/5 px-2 py-0.5 text-xs text-primary">
              <Package className="size-3" />
              <span className="font-mono">{selected.prod_code}</span>
              <span className="truncate max-w-[40vw] sm:max-w-[260px]">{selected.prod_name}</span>
            </span>
            <ProductHierarchyTrail product={analysisData?.product} />
          </div>
        )}
        {!selected &&
          debounced.length >= 3 &&
          (searchFetching || (suggestions && suggestions.length > 0)) && (
            <ul className="absolute left-0 right-0 top-full z-20 mt-1 max-h-80 overflow-y-auto rounded-lg border border-border bg-popover shadow-lg">
              {searchFetching && (
                <li className="flex items-center justify-center gap-2 px-3 py-4 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" /> Buscando…
                </li>
              )}
              {!searchFetching &&
                suggestions?.map((s) => (
                  <li key={s.prod_code}>
                    <button
                      onClick={() => {
                        setSelected(s);
                        setQuery("");
                      }}
                      className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-muted"
                    >
                      <Package className="size-4 text-muted-foreground" />
                      <span className="font-mono text-xs text-muted-foreground">{s.prod_code}</span>
                      <span className="truncate">{s.prod_name}</span>
                    </button>
                  </li>
                ))}
            </ul>
          )}
      </div>

      {selected && analysisLoading && !analysisData && (
        <>
          <section className="mt-6 grid gap-4 md:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="kpi-card">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="mt-2 h-8 w-28" />
                <Skeleton className="mt-2 h-3 w-20" />
              </div>
            ))}
          </section>
          <section className="mt-6 grid gap-4 lg:grid-cols-2">
            {Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="kpi-card">
                <Skeleton className="h-5 w-48" />
                <Skeleton className="mt-2 h-3 w-64" />
                <Skeleton className="mt-4 h-72 w-full rounded-lg" />
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
        <>
          <section className="mt-6 grid gap-4 md:grid-cols-3">
            <KpiCard
              label="Venda na data referência"
              value={fmtBRL(analysisData.refValue ?? 0)}
              hint={
                analysisData.refDate
                  ? `${refWeekdayFull} · ${fmtBRShort(analysisData.refDate)}`
                  : undefined
              }
            />
            <KpiCard
              label={`Média de ${refWeekdayPlural?.toLowerCase() ?? "datas anteriores"}`}
              value={fmtBRL(avgSame)}
              delta={avgSame > 0 ? ((analysisData.refValue ?? 0) - avgSame) / avgSame : null}
              hint={`${refArticle} 4 ${refWeekdayPlural?.toLowerCase() ?? "datas"}`}
            />
            <KpiCard
              label="Média diária"
              value={fmtBRL(avgDaily)}
              delta={avgDaily > 0 ? ((analysisData.refValue ?? 0) - avgDaily) / avgDaily : null}
              hint="Últimos 28 dias"
            />
          </section>

          <Suspense
            fallback={
              <section className="mt-6 grid gap-4 lg:grid-cols-2">
                <div className="kpi-card">
                  <Skeleton className="h-72 w-full rounded-lg" />
                </div>
                <div className="kpi-card">
                  <Skeleton className="h-72 w-full rounded-lg" />
                </div>
              </section>
            }
          >
            <ProductCharts analysisData={analysisData} hideStoreComp={storeCode !== "__all__"} />
          </Suspense>

          <PaginatedHistory
            title={`${refArticle} ${refWeekdayPlural?.toLowerCase() ?? "datas"}`}
            rows={sameWeekdayAll}
          />

          <PaginatedHistory
            title="Histórico completo"
            rows={analysisData.evolution as SeriesPoint[]}
          />
        </>
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
