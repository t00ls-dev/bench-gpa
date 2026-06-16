import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getDashboard } from "@/lib/analytics.functions";
import { FilterBar, type Filters } from "@/components/filter-bar";
import { KpiCard, fmtBRL, fmtInt } from "@/components/kpi-card";
import { fmtBRShort } from "@/lib/utils";
import { usePersistentState } from "@/hooks/use-persistent-state";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, LineChart, Line, CartesianGrid } from "recharts";

export const Route = createFileRoute("/_authenticated/")({
  component: Dashboard,
});

const initial: Filters = {
  dateFrom: "", dateTo: "", stores: [], deptos: [], secoes: [], grupos: [], subgrupos: [], compare: "prev_period",
};

function Dashboard() {
  const [filters, setFilters] = usePersistentState<Filters>("bench-gpa:filters:dashboard", initial);
  const fn = useServerFn(getDashboard);
  const { data, isFetching } = useQuery({
    queryKey: ["dashboard", filters],
    queryFn: () => fn({ data: filters }),
    enabled: !!filters.dateFrom && !!filters.dateTo,
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });

  const delta = (cur: number, prev: number | undefined) =>
    prev && prev > 0 ? (cur - prev) / prev : null;

  return (
    <div>
      <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold">Dashboard</h1>
          <p className="text-sm text-muted-foreground">Visão geral de vendas por loja, departamento e período.</p>
        </div>
        {isFetching && <span className="text-xs text-muted-foreground">Atualizando…</span>}
      </header>

      <div className="mb-4">
        <LastUpdateInfo />
      </div>

      <FilterBar value={filters} onChange={setFilters} />

      <section className="grid gap-4 md:grid-cols-3">
        <KpiCard
          label="Venda total"
          value={fmtBRL(data?.current.total ?? 0)}
          delta={data?.previous ? delta(data.current.total, data.previous.total) : null}
          hint={data?.previous ? `Anterior: ${fmtBRL(data.previous.total)}` : undefined}
        />
        <KpiCard
          label="Itens vendidos"
          value={fmtInt(data?.current.count ?? 0)}
          delta={data?.previous ? delta(data.current.count, data.previous.count) : null}
          hint={data?.previous ? `Anterior: ${fmtInt(data.previous.count)}` : undefined}
        />
        <KpiCard
          label="Lojas com venda"
          value={fmtInt(data?.current.byStore.length ?? 0)}
          delta={data?.previous ? delta(data.current.byStore.length, data.previous.byStore.length) : null}
        />
      </section>

      <section className="mt-6 grid gap-4 lg:grid-cols-2">
        <div className="kpi-card">
          <h2 className="font-display text-lg font-semibold">Evolução diária</h2>
          <p className="text-xs text-muted-foreground">Soma das vendas por data no período filtrado.</p>
          <div className="mt-4 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data?.current.byDate ?? []}>
                <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.92 0.01 240)" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
                <Tooltip formatter={(v: number) => fmtBRL(v)} />
                <Line type="monotone" dataKey="val" stroke="oklch(0.48 0.12 165)" strokeWidth={2.5} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="kpi-card">
          <h2 className="font-display text-lg font-semibold">Top lojas</h2>
          <p className="text-xs text-muted-foreground">Ranking por venda total no período.</p>
          <div className="mt-4 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={(data?.current.byStore ?? []).slice(0, 10)} margin={{ left: 8, right: 8, bottom: 24 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.92 0.01 240)" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-30} textAnchor="end" height={50} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
                <Tooltip formatter={(v: number) => fmtBRL(v)} />
                <Bar dataKey="val" fill="oklch(0.32 0.09 265)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

        </div>
      </section>

      <section className="mt-6 kpi-card">
        <h2 className="font-display text-lg font-semibold">Departamentos</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="py-2">Departamento</th>
                <th className="py-2 text-right">Venda</th>
                <th className="py-2 text-right">% do total</th>
              </tr>
            </thead>
            <tbody>
              {(data?.current.byDepto ?? []).map((d: { name: string; val: number }) => {
                const pct = data!.current.total > 0 ? (d.val / data!.current.total) * 100 : 0;
                return (
                  <tr key={d.name} className="border-b border-border/60">
                    <td className="py-2">{d.name}</td>
                    <td className="num py-2 text-right font-medium">{fmtBRL(d.val)}</td>
                    <td className="num py-2 text-right text-muted-foreground">{pct.toFixed(1)}%</td>
                  </tr>
                );
              })}
              {(!data || data.current.byDepto.length === 0) && (
                <tr><td colSpan={3} className="py-6 text-center text-sm text-muted-foreground">Sem dados para os filtros selecionados.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
