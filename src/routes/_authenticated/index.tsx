import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getDashboard, getDashboardRankings } from "@/lib/analytics.functions";
import { FilterBar, type Filters } from "@/components/filter-bar";
import { KpiCard, fmtBRL } from "@/components/kpi-card";
import { RankingCard } from "@/components/ranking-card";
import { fmtBRShort } from "@/lib/utils";
import { usePersistentState } from "@/hooks/use-persistent-state";
import { lazy, Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { LayoutDashboard } from "lucide-react";

const DashboardCharts = lazy(() => import("@/components/dashboard-charts"));

export const Route = createFileRoute("/_authenticated/")({
  component: Dashboard,
});

const initial: Filters = {
  dateFrom: "", dateTo: "", stores: [], deptos: [], secoes: [], grupos: [], subgrupos: [], compare: "prev_period",
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
    staleTime: 60_000, gcTime: 5 * 60_000, refetchOnWindowFocus: false,
  });

  const { data: rankings, isFetching: rankingLoading } = useQuery({
    queryKey: ["dashboard-rankings", filters],
    queryFn: () => fnRank({ data: { ...filters, limit: 10 } }),
    enabled,
    staleTime: 60_000, gcTime: 5 * 60_000, refetchOnWindowFocus: false,
  });

  const delta = (cur: number, prev: number | undefined) =>
    prev && prev > 0 ? (cur - prev) / prev : null;

  return (
    <div>
      <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold flex items-center gap-2">
            <LayoutDashboard className="size-7 text-primary shrink-0" /> Dashboard
          </h1>
          <p className="text-sm text-muted-foreground">Visão geral de vendas por loja, departamento e período.</p>
        </div>
        {isFetching && <span className="text-xs text-muted-foreground">Atualizando…</span>}
      </header>

      <FilterBar value={filters} onChange={setFilters} />

      <section className="grid gap-4 sm:grid-cols-1">
        {isLoading ? (
          <div className="kpi-card">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="mt-2 h-8 w-40" />
            <Skeleton className="mt-2 h-3 w-32" />
          </div>
        ) : data && data.current.total === 0 ? (
          <div className="kpi-card text-center py-10">
            <p className="text-sm text-muted-foreground">Nenhuma venda encontrada para o período e filtros selecionados.</p>
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

      <Suspense fallback={
        <section className="mt-6 grid gap-4 lg:grid-cols-2">
          <div className="kpi-card"><Skeleton className="h-64 w-full rounded-lg" /></div>
          <div className="kpi-card"><Skeleton className="h-64 w-full rounded-lg" /></div>
        </section>
      }>
        <DashboardCharts data={data} isLoading={isLoading} />
      </Suspense>

      <section className="mt-6 grid gap-4 lg:grid-cols-2">
        <RankingCard title="Top Departamentos" items={rankings?.byDepto ?? []} isLoading={rankingLoading} />
        <RankingCard title="Top Seções" items={rankings?.bySecao ?? []} isLoading={rankingLoading} />
        <RankingCard title="Top Grupos" items={rankings?.byGrupo ?? []} isLoading={rankingLoading} />
        <RankingCard title="Top Subgrupos" items={rankings?.bySubgrupo ?? []} isLoading={rankingLoading} />
      </section>

      <section className="mt-6">
        <RankingCard title="Top Produtos" items={rankings?.byProduto ?? []} isLoading={rankingLoading} />
      </section>
    </div>
  );
}
