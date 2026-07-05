import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getDashboard, getDashboardRankings } from "@/lib/analytics.functions";
import { FilterBar, type Filters } from "@/components/filter-bar";
import { KpiCard, fmtBRL } from "@/components/kpi-card";
import { RankingCard } from "@/components/ranking-card";
import { fmtBRShort } from "@/lib/utils";
import { usePersistentState } from "@/hooks/use-persistent-state";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, LineChart, Line, CartesianGrid } from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { LayoutDashboard } from "lucide-react";

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
        ) : (
          <KpiCard
            label="Venda total"
            value={fmtBRL(data?.current.total ?? 0)}
            delta={data?.previous ? delta(data.current.total, data.previous.total) : null}
            hint={data?.previous ? `Anterior: ${fmtBRL(data.previous.total)}` : undefined}
          />
        )}
      </section>

      <section className="mt-6 grid gap-4 lg:grid-cols-2">
        <div className="kpi-card">
          <h2 className="font-display text-lg font-semibold">Evolução diária</h2>
          <p className="text-xs text-muted-foreground">Soma das vendas por data no período filtrado.</p>
          <div className="mt-4 h-64">
            {isLoading ? (
              <Skeleton className="h-full w-full rounded-lg" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data?.current.byDate ?? []}>
                  <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.92 0.01 240)" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(v) => fmtBRShort(String(v))} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
                  <Tooltip formatter={(v: number) => fmtBRL(v)} labelFormatter={(v) => fmtBRShort(String(v))} />
                  <Line type="monotone" dataKey="val" stroke="oklch(0.48 0.12 165)" strokeWidth={2.5} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="kpi-card">
          <h2 className="font-display text-lg font-semibold">Top lojas</h2>
          <p className="text-xs text-muted-foreground">Ranking por venda total no período.</p>
          <div className="mt-4 h-64">
            {isLoading ? (
              <Skeleton className="h-full w-full rounded-lg" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={(data?.current.byStore ?? []).slice(0, 10)} margin={{ left: 8, right: 8, bottom: 24 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.92 0.01 240)" />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-30} textAnchor="end" height={50} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
                  <Tooltip formatter={(v: number) => fmtBRL(v)} />
                  <Bar dataKey="val" fill="oklch(0.32 0.09 265)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </section>

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
