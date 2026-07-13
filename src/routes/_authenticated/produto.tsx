import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useRef, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { searchProducts, getProductAnalysis, getStores } from "@/lib/analytics.functions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MultiSelect } from "@/components/multi-select";
import { KpiCard, fmtBRL } from "@/components/kpi-card";
import { lazy, Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, Package, X, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { fmtBRShort } from "@/lib/utils";

const ProductCharts = lazy(() =>
  import("@/components/product-charts").then((m) => ({ default: m.ProductCharts })),
);

export const Route = createFileRoute("/_authenticated/produto")({
  validateSearch: (s: Record<string, unknown>) => ({
    plu: typeof s.plu === "string" ? s.plu : undefined,
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
interface StorePoint {
  code: string;
  name: string;
  val: number;
}

function ProductHierarchyTrail({
  product,
}: {
  product:
    | { depto: string | null; secao: string | null; grupo: string | null; subgrupo: string | null }
    | null
    | undefined;
}) {
  if (!product) return null;
  const levels = [product.depto, product.secao, product.grupo, product.subgrupo].filter(
    (v): v is string => !!v && v.trim().length > 0,
  );
  if (levels.length === 0) return null;

  const parents = levels.slice(0, -1).join(" › ");
  const last = levels[levels.length - 1];

  return (
    <span className="inline-flex min-w-0 max-w-full items-center gap-1 rounded-full border border-border bg-muted px-2.5 py-0.5 text-xs text-muted-foreground">
      {parents && <span className="min-w-0 truncate">{parents}</span>}
      {parents && <span className="shrink-0 text-muted-foreground/40">›</span>}
      <span className="max-w-[45vw] shrink-0 truncate font-medium text-foreground/80 sm:max-w-[200px]">
        {last}
      </span>
    </span>
  );
}

function ProdutoPage() {
  const { plu } = Route.useSearch();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<{ prod_code: string; prod_name: string } | null>(
    plu ? { prod_code: plu, prod_name: plu } : null,
  );
  const [debounced, setDebounced] = useState("");
  const [storeCode, setStoreCode] = useState<string>("__all__");
  const tRef = useRef<number | null>(null);

  useEffect(() => {
    if (plu && (!selected || selected.prod_code !== plu)) {
      setSelected({ prod_code: plu, prod_name: plu });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plu]);

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

      <div className="kpi-card mb-4 grid gap-3 md:grid-cols-2">
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
        <div className="flex items-center gap-2">
          <Search className="size-4 text-muted-foreground" />
          <Input
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
              <span className="truncate max-w-[260px]">{selected.prod_name}</span>
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
              hint={`Todos os ${refWeekdayPlural?.toLowerCase() ?? ""} do histórico`}
            />
            <KpiCard
              label="Média diária"
              value={fmtBRL(avgDaily)}
              delta={avgDaily > 0 ? ((analysisData.refValue ?? 0) - avgDaily) / avgDaily : null}
              hint="Considerando todo o histórico disponível"
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

      {!selected && (
        <div className="mt-12 text-center text-sm text-muted-foreground">
          Use a busca acima para começar.
        </div>
      )}
    </div>
  );
}

function PaginatedHistory({ title, rows }: { title: string; rows: SeriesPoint[] }) {
  const sorted = useMemo(() => [...rows].sort((a, b) => (a.date < b.date ? 1 : -1)), [rows]);
  const PAGE = 10;
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE));
  const start = (page - 1) * PAGE;
  const slice = sorted.slice(start, start + PAGE);

  return (
    <section className="mt-6 kpi-card">
      <div className="mb-3 flex items-center justify-between gap-3 flex-wrap">
        <h2 className="font-display text-lg font-semibold">{title}</h2>
        <span className="text-xs text-muted-foreground">
          {sorted.length} registro(s) · página {page} de {totalPages}
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
              <th className="py-2">Data</th>
              <th className="py-2 text-right">Venda</th>
            </tr>
          </thead>
          <tbody>
            {slice.map((d) => (
              <tr key={d.date} className="border-b border-border/60">
                <td className="py-2 whitespace-nowrap">{fmtBRShort(d.date)}</td>
                <td className="num py-2 text-right font-medium">{fmtBRL(d.val)}</td>
              </tr>
            ))}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={2} className="py-6 text-center text-xs text-muted-foreground">
                  Sem histórico disponível.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <div className="mt-3 flex items-center justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
          >
            <ChevronLeft className="size-3 mr-1" /> Anterior
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
          >
            Próxima <ChevronRight className="size-3 ml-1" />
          </Button>
        </div>
      )}
    </section>
  );
}
