import { ResponsiveContainer, LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { fmtBRL } from "@/components/kpi-card";
import { fmtBRShort } from "@/lib/utils";

interface DashboardData {
  current: {
    byDate: { date: string; val: number }[];
    byStore: { code: string; name: string; val: number }[];
  };
}

export function DashboardCharts({ data, isLoading }: { data: DashboardData | undefined; isLoading: boolean }) {
  return (
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
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(v) => fmtBRShort(String(v))} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
                <Tooltip formatter={(v: number) => fmtBRL(v)} labelFormatter={(v) => fmtBRShort(String(v))} />
                <Line type="monotone" dataKey="val" stroke="var(--chart-1)" strokeWidth={2.5} dot={false} />
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
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-30} textAnchor="end" height={50} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
                <Tooltip formatter={(v: number) => fmtBRL(v)} />
                <Bar dataKey="val" fill="var(--chart-2)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </section>
  );
}
