import { ResponsiveContainer, BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { fmtBRL } from "@/components/kpi-card";
import { fmtBRShort } from "@/lib/utils";

interface StorePoint { code: string; name: string; val: number }
interface SeriesPoint { date: string; val: number }

interface ProductChartsData {
  byStore: StorePoint[];
  evolution: SeriesPoint[];
}

export function ProductCharts({ analysisData }: { analysisData: ProductChartsData }) {
  return (
    <section className="mt-6 grid gap-4 lg:grid-cols-2">
      <div className="kpi-card">
        <h2 className="font-display text-lg font-semibold">Comparação entre lojas</h2>
        <p className="text-xs text-muted-foreground">Venda do produto por loja na data referência.</p>
        <div className="mt-4 h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={(analysisData.byStore as StorePoint[]).slice(0, 12)} margin={{ left: 8, right: 8, bottom: 28 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="code" tick={{ fontSize: 10 }} interval={0} angle={-30} textAnchor="end" height={50} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
              <Tooltip formatter={(v: number) => fmtBRL(v)} labelFormatter={(label, payload) => {
                const p = payload?.[0]?.payload as StorePoint | undefined;
                return p ? `${p.code} - ${p.name}` : String(label);
              }} />
              <Bar dataKey="val" fill="var(--chart-1)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="kpi-card">
        <h2 className="font-display text-lg font-semibold">Evolução de vendas</h2>
        <p className="text-xs text-muted-foreground">Histórico de datas com venda registrada.</p>
        <div className="mt-4 h-72">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={analysisData.evolution}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(v) => fmtBRShort(String(v))} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
              <Tooltip formatter={(v: number) => fmtBRL(v)} labelFormatter={(v) => fmtBRShort(String(v))} />
              <Line type="monotone" dataKey="val" stroke="var(--chart-2)" strokeWidth={2.5} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </section>
  );
}
