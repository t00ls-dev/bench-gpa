import { useMemo } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { fmtBRL } from "@/lib/utils";
import { fmtBRShort } from "@/lib/utils";

interface DashboardData {
  byDate: { date: string; val: number }[];
  byStore: { code: string; name: string; val: number }[];
}

interface ChartRow {
  date: string;
  Atual: number;
}

export function DashboardCharts({
  data,
  isLoading,
  hideStores,
}: {
  data: DashboardData | undefined;
  isLoading: boolean;
  hideStores?: boolean;
}) {
  const chartData: ChartRow[] = useMemo(
    () => (data?.byDate ?? []).map((d) => ({ date: d.date, Atual: d.val })),
    [data],
  );

  const vals = chartData.map((d) => d.Atual);
  const maxVal = vals.length ? Math.max(...vals) : 0;
  const minVal = vals.length ? Math.min(...vals) : 0;
  const maxIndex = vals.indexOf(maxVal);
  const minIndex = vals.indexOf(minVal);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function CustomDot(props: any) {
    const { cx, cy, index } = props;
    if (cx == null || cy == null) return null;
    if (index !== maxIndex && index !== minIndex) return null;
    const isMax = index === maxIndex;
    return (
      <circle
        cx={cx}
        cy={cy}
        r={4}
        fill={isMax ? "var(--success)" : "var(--destructive)"}
        stroke="var(--card)"
        strokeWidth={2}
      />
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function ChartTooltip({ active, payload, label }: any) {
    if (!active || !payload?.length) return null;
    const atual = payload.find((p: { dataKey: string; value: number }) => p.dataKey === "Atual");
    if (!atual) return null;
    return (
      <div className="rounded-md border bg-background px-3 py-2 text-xs shadow-md">
        <p className="font-medium">{fmtBRShort(String(label))}</p>
        <p>
          Atual: <span className="font-medium">{fmtBRL(atual.value)}</span>
        </p>
      </div>
    );
  }

  return (
    <section className={`mt-6 grid gap-4 ${hideStores ? "" : "lg:grid-cols-2"}`}>
      <div className="kpi-card">
        <h2 className="font-display text-lg font-semibold">Evolução diária</h2>
        <p className="text-xs text-muted-foreground">
          Soma das vendas por data no período filtrado.
        </p>
        <div className="mt-4 h-64">
          {isLoading ? (
            <Skeleton className="h-full w-full rounded-lg" />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v) => fmtBRShort(String(v))}
                />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
                <Tooltip content={<ChartTooltip />} />
                <Line
                  type="monotone"
                  dataKey="Atual"
                  stroke="var(--chart-1)"
                  strokeWidth={2.5}
                  dot={<CustomDot />}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {hideStores ? null : (
        <div className="kpi-card">
          <h2 className="font-display text-lg font-semibold">Top lojas</h2>
          <p className="text-xs text-muted-foreground">Ranking por venda total no período.</p>
          <div className="mt-4 h-64">
            {isLoading ? (
              <Skeleton className="h-full w-full rounded-lg" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={(data?.byStore ?? []).slice(0, 10)}
                  margin={{ left: 8, right: 8, bottom: 24 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 10 }}
                    interval="preserveStart"
                    angle={-30}
                    textAnchor="end"
                    height={50}
                  />
                  <YAxis
                    tick={{ fontSize: 11 }}
                    tickFormatter={(v) => `${Math.round(v / 1000)}k`}
                  />
                  <Tooltip formatter={(v: number) => fmtBRL(v)} />
                  <Bar dataKey="val" fill="var(--chart-2)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
