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
  Customized,
} from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { fmtBRL } from "@/lib/utils";
import { fmtBRShort } from "@/lib/utils";

interface DashboardData {
  current: {
    byDate: { date: string; val: number }[];
    byStore: { code: string; name: string; val: number }[];
  };
  previous?: {
    byDate: { date: string; val: number }[];
  } | null;
}

interface ChartRow {
  date: string;
  Atual: number;
  Anterior: number | null;
  ma7: number | null;
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
  const chartData: ChartRow[] = useMemo(() => {
    const raw = data?.current.byDate ?? [];
    const prevByDate = new Map((data?.previous?.byDate ?? []).map((d) => [d.date, d.val]));
    const result: ChartRow[] = raw.map((d) => ({
      date: d.date,
      Atual: d.val,
      Anterior: prevByDate.get(d.date) ?? null,
      ma7: null,
    }));
    for (let i = 6; i < result.length; i++) {
      let sum = 0;
      for (let j = i - 6; j <= i; j++) sum += result[j].Atual;
      result[i].ma7 = sum / 7;
    }
    return result;
  }, [data]);

  const vals = chartData.map((d) => d.Atual);
  const maxVal = vals.length ? Math.max(...vals) : 0;
  const minVal = vals.length ? Math.min(...vals) : 0;
  const maxIndex = vals.indexOf(maxVal);
  const minIndex = vals.indexOf(minVal);
  const hasComparison = chartData.some((d) => d.Anterior !== null);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function FillBetween({ formattedGraphicalItems }: any) {
    if (!formattedGraphicalItems?.[0] || !formattedGraphicalItems?.[1]) return null;
    const pts1 = formattedGraphicalItems[0].props.points as { x: number; y: number }[];
    const pts2 = formattedGraphicalItems[1].props.points as { x: number; y: number }[];
    if (!pts1?.length || !pts2?.length) return null;
    const d =
      pts1.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ") +
      " " +
      [...pts2]
        .reverse()
        .map((p) => `L${p.x},${p.y}`)
        .join(" ") +
      " Z";
    return <path d={d} fill="url(#deltaGrad)" />;
  }

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
        fill={isMax ? "#16a34a" : "#dc2626"}
        stroke="white"
        strokeWidth={2}
      />
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function ChartTooltip({ active, payload, label }: any) {
    if (!active || !payload?.length) return null;
    const atual = payload.find((p: { dataKey: string; value: number }) => p.dataKey === "Atual");
    const anterior = payload.find(
      (p: { dataKey: string; value: number }) => p.dataKey === "Anterior",
    );
    if (!atual) return null;
    const diff = atual.value - (anterior?.value ?? 0);
    const pct = anterior?.value ? (diff / anterior.value) * 100 : null;
    return (
      <div className="rounded-md border bg-background px-3 py-2 text-xs shadow-md">
        <p className="font-medium">{fmtBRShort(String(label))}</p>
        <p>
          Atual: <span className="font-medium">{fmtBRL(atual.value)}</span>
        </p>
        {anterior?.value != null && (
          <>
            <p>Anterior: {fmtBRL(anterior.value)}</p>
            <p className={diff >= 0 ? "text-green-600" : "text-red-600"}>
              {diff >= 0 ? "▲ " : "▼ "}
              {fmtBRL(Math.abs(diff))}
              {pct != null ? ` (${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%)` : ""}
            </p>
          </>
        )}
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
                <defs>
                  <linearGradient id="deltaGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.25} />
                    <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0.04} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v) => fmtBRShort(String(v))}
                  interval={4}
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
                {hasComparison && (
                  <Line
                    type="monotone"
                    dataKey="Anterior"
                    stroke="var(--chart-1)"
                    strokeWidth={1.5}
                    strokeDasharray="4 4"
                    dot={false}
                    opacity={0.5}
                  />
                )}
                <Line
                  type="monotone"
                  dataKey="ma7"
                  stroke="var(--chart-3)"
                  strokeWidth={1.5}
                  strokeDasharray="2 3"
                  dot={false}
                  opacity={0.7}
                  connectNulls
                />
                {hasComparison && <Customized component={FillBetween} />}
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
        <div className="mt-2 flex items-center justify-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="inline-block size-2.5 rounded-full bg-[var(--chart-1)]" /> Atual
          </span>
          {hasComparison && (
            <span className="flex items-center gap-1.5">
              <span className="inline-block size-2.5 rounded-sm border-2 border-dashed border-[var(--chart-1)] opacity-50" />{" "}
              Anterior
            </span>
          )}
          <span className="flex items-center gap-1.5">
            <span className="inline-block size-2.5 rounded-sm border-2 border-dotted border-[var(--chart-3)] opacity-70" />{" "}
            Média 7d
          </span>
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
                  data={(data?.current.byStore ?? []).slice(0, 10)}
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
