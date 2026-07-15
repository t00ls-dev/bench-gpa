import { useMemo } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Cell,
} from "recharts";
import { fmtBRL } from "@/components/kpi-card";
import { fmtBRShort } from "@/lib/utils";

interface StorePoint {
  code: string;
  name: string;
  val: number;
}
interface SeriesPoint {
  date: string;
  val: number;
}

const WEEKDAYS_SHORT = ["Dom", "Seg", "Ter", "qua", "Qui", "Sex", "Sáb"];

interface ProductChartsData {
  byStore: StorePoint[];
  evolution: SeriesPoint[];
}

export function ProductCharts({
  analysisData,
  hideStoreComp,
}: {
  analysisData: ProductChartsData;
  hideStoreComp?: boolean;
}) {
  const dowData = useMemo(() => {
    const ev = analysisData.evolution as SeriesPoint[] | undefined;
    if (!ev?.length) return [];
    const groups: Record<number, { sum: number; count: number }> = {};
    for (const d of ev) {
      const dow = new Date(d.date + "T00:00:00Z").getUTCDay();
      if (!groups[dow]) groups[dow] = { sum: 0, count: 0 };
      groups[dow].sum += d.val;
      groups[dow].count += 1;
    }
    return Array.from({ length: 7 }, (_, i) => ({
      dow: i,
      label: WEEKDAYS_SHORT[i],
      avg: groups[i] ? Math.round(groups[i].sum / groups[i].count) : 0,
      count: groups[i]?.count ?? 0,
    }));
  }, [analysisData.evolution]);

  const maxAvg = Math.max(...dowData.map((d) => d.avg), 0);

  return (
    <section className={`mt-6 grid gap-4 ${hideStoreComp ? "" : "lg:grid-cols-2"}`}>
      {hideStoreComp ? null : (
        <div className="kpi-card">
          <h2 className="font-display text-lg font-semibold">Comparação entre lojas</h2>
          <p className="text-xs text-muted-foreground">
            Venda do produto por loja na data referência.
          </p>
          <div className="mt-4 h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={(analysisData.byStore as StorePoint[]).slice(0, 12)}
                margin={{ left: 8, right: 8, bottom: 28 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis
                  dataKey="code"
                  tick={{ fontSize: 10 }}
                  interval="preserveStart"
                  angle={-30}
                  textAnchor="end"
                  height={50}
                />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
                <Tooltip
                  formatter={(v: number) => fmtBRL(v)}
                  labelFormatter={(label, payload) => {
                    const p = payload?.[0]?.payload as StorePoint | undefined;
                    return p ? `${p.code} - ${p.name}` : String(label);
                  }}
                />
                <Bar dataKey="val" fill="var(--chart-1)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      <div className="kpi-card">
        <h2 className="font-display text-lg font-semibold">Evolução de vendas</h2>
        <p className="text-xs text-muted-foreground">Histórico de datas com venda registrada.</p>
        <div className="mt-4 h-72">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={analysisData.evolution}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 10 }}
                tickFormatter={(v) => fmtBRShort(String(v))}
              />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
              <Tooltip
                formatter={(v: number) => fmtBRL(v)}
                labelFormatter={(v) => fmtBRShort(String(v))}
              />
              <Line
                type="monotone"
                dataKey="val"
                stroke="var(--chart-2)"
                strokeWidth={2.5}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="kpi-card lg:col-span-2">
        <h2 className="font-display text-lg font-semibold">Desempenho por dia da semana</h2>
        <p className="text-xs text-muted-foreground">
          Média de vendas do produto por dia da semana.
        </p>
        <div className="mt-4 h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={dowData} margin={{ left: 8, right: 8, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} interval="preserveStart" />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
              <Tooltip
                formatter={(v: number) => fmtBRL(v)}
                labelFormatter={(label) => {
                  const item = dowData.find((d) => d.label === label);
                  return item ? `${WEEKDAYS_SHORT[item.dow]} · ${item.count} dia(s)` : label;
                }}
              />
              <Bar dataKey="avg" radius={[4, 4, 0, 0]}>
                {dowData.map((entry) => (
                  <Cell
                    key={entry.dow}
                    fill={
                      entry.avg === 0
                        ? "var(--muted-foreground)"
                        : entry.avg === maxAvg
                          ? "#16a34a"
                          : "var(--chart-2)"
                    }
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </section>
  );
}
