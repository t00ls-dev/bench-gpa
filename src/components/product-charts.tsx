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
import { fmtBRL } from "@/lib/utils";
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
  byStore?: StorePoint[];
  evolution?: SeriesPoint[];
}

export function ProductCharts({
  analysisData,
  hideStoreComp,
}: {
  analysisData: ProductChartsData;
  hideStoreComp?: boolean;
}) {
  // Média móvel de 7 pontos (não necessariamente 7 dias corridos, se houver
  // data sem venda — a proc não preenche zero, então "7 pontos" é o que dá
  // pra calcular sem inventar dado). Mesmo cálculo de dashboard-charts.tsx.
  const evolutionWithMa = useMemo(() => {
    const ev = (analysisData.evolution as SeriesPoint[] | undefined) ?? [];
    const result = ev.map((d) => ({ ...d, ma7: null as number | null }));
    for (let i = 6; i < result.length; i++) {
      let sum = 0;
      for (let j = i - 6; j <= i; j++) sum += result[j].val;
      result[i].ma7 = sum / 7;
    }
    return result;
  }, [analysisData.evolution]);

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

  const evolutionVals = evolutionWithMa.map((d) => d.val);
  const evolutionMaxVal = evolutionVals.length ? Math.max(...evolutionVals) : 0;
  const evolutionMinVal = evolutionVals.length ? Math.min(...evolutionVals) : 0;
  const evolutionMaxIndex = evolutionVals.indexOf(evolutionMaxVal);
  const evolutionMinIndex = evolutionVals.indexOf(evolutionMinVal);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function EvolutionDot(props: any) {
    const { cx, cy, index } = props;
    if (cx == null || cy == null) return null;
    if (index !== evolutionMaxIndex && index !== evolutionMinIndex) return null;
    const isMax = index === evolutionMaxIndex;
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
                data={(analysisData.byStore ?? []).slice(0, 12)}
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
            <LineChart data={evolutionWithMa}>
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
                dot={<EvolutionDot />}
              />
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
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-2 flex items-center justify-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="inline-block size-2.5 rounded-full bg-[var(--chart-2)]" /> Venda
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block size-2.5 rounded-sm border-2 border-dotted border-[var(--chart-3)] opacity-70" />{" "}
            Média 7d
          </span>
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
                          ? "var(--success)"
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
