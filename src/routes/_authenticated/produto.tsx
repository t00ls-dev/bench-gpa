import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { searchProducts, getProductAnalysis, getFilterOptions } from "@/lib/analytics.functions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { KpiCard, fmtBRL } from "@/components/kpi-card";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, LineChart, Line, CartesianGrid } from "recharts";
import { Search, Package } from "lucide-react";

export const Route = createFileRoute("/_authenticated/produto")({
  component: ProdutoPage,
});

const WEEKDAYS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

interface SeriesPoint { date: string; val: number }
interface StorePoint { code: string; name: string; val: number }

function ProdutoPage() {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<{ prod_code: string; prod_name: string } | null>(null);
  const [debounced, setDebounced] = useState("");
  const [storeCode, setStoreCode] = useState<string>("__all__");
  const tRef = useRef<number | null>(null);

  useEffect(() => {
    if (tRef.current) window.clearTimeout(tRef.current);
    tRef.current = window.setTimeout(() => setDebounced(query), 250);
  }, [query]);

  const search = useServerFn(searchProducts);
  const analysis = useServerFn(getProductAnalysis);
  const getOpts = useServerFn(getFilterOptions);

  const { data: opts } = useQuery({
    queryKey: ["filter-options-all"],
    queryFn: () => getOpts({ data: { dateFrom: null, dateTo: null } }),
  });
  const stores = (opts?.stores ?? []) as { store_code: string; store_name: string }[];

  const { data: suggestions } = useQuery({
    queryKey: ["product-search", debounced],
    queryFn: () => search({ data: { q: debounced } }),
    enabled: debounced.length >= 3 && !selected,
  });

  const { data: analysisData } = useQuery({
    queryKey: ["product-analysis", selected?.prod_code, storeCode],
    queryFn: () => analysis({ data: {
      prodCode: selected!.prod_code,
      storeCode: storeCode === "__all__" ? null : storeCode,
      referenceDate: null,
    } }),
    enabled: !!selected,
  });

  const refWeekday = analysisData?.refDate ? WEEKDAYS[new Date(analysisData.refDate + "T00:00:00Z").getUTCDay()] : null;
  const avgSame = analysisData?.lastFourSameWeekday?.length
    ? analysisData.lastFourSameWeekday.reduce((a: number, b: SeriesPoint) => a + b.val, 0) / analysisData.lastFourSameWeekday.length
    : 0;
  const avgAll = analysisData?.lastFourAll?.length
    ? analysisData.lastFourAll.reduce((a: number, b: SeriesPoint) => a + b.val, 0) / analysisData.lastFourAll.length
    : 0;

  return (
    <div>
      <header className="mb-6">
        <h1 className="font-display text-3xl font-bold">Análise de produto</h1>
        <p className="text-sm text-muted-foreground">Pesquise um produto para ver comparações entre lojas, evolução e benchmarks semanais.</p>
      </header>

      <div className="kpi-card mb-4 grid gap-3 md:grid-cols-2">
        <div>
          <Label className="text-xs">Loja</Label>
          <Select value={storeCode} onValueChange={setStoreCode}>
            <SelectTrigger className="mt-1 h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todas as lojas</SelectItem>
              {stores.map((s) => (
                <SelectItem key={s.store_code} value={s.store_code}>{s.store_code} — {s.store_name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="kpi-card relative">
        <div className="flex items-center gap-2">
          <Search className="size-4 text-muted-foreground" />
          <Input
            placeholder="Digite ao menos 3 caracteres (nome ou código)…"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setSelected(null); }}
            className="border-0 shadow-none focus-visible:ring-0"
          />
        </div>
        {!selected && debounced.length >= 3 && suggestions && suggestions.length > 0 && (
          <ul className="absolute left-0 right-0 top-full z-20 mt-1 max-h-80 overflow-y-auto rounded-lg border border-border bg-popover shadow-lg">
            {suggestions.map((s) => (
              <li key={s.prod_code}>
                <button
                  onClick={() => { setSelected(s); setQuery(`${s.prod_code} — ${s.prod_name}`); }}
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

      {selected && analysisData && (
        <>
          <section className="mt-6 grid gap-4 md:grid-cols-3">
            <KpiCard label="Venda na data referência" value={fmtBRL(analysisData.refValue ?? 0)} hint={analysisData.refDate ? `${refWeekday}, ${new Date(analysisData.refDate + "T00:00:00").toLocaleDateString("pt-BR")}` : undefined} />
            <KpiCard label={`Média 4 ${refWeekday?.toLowerCase() ?? "dias"}s anteriores`} value={fmtBRL(avgSame)} delta={avgSame > 0 ? ((analysisData.refValue ?? 0) - avgSame) / avgSame : null} hint="Mesmo dia da semana" />
            <KpiCard label="Média últimas 4 datas" value={fmtBRL(avgAll)} delta={avgAll > 0 ? ((analysisData.refValue ?? 0) - avgAll) / avgAll : null} hint="Independente do dia da semana" />
          </section>

          <section className="mt-6 grid gap-4 lg:grid-cols-2">
            <div className="kpi-card">
              <h2 className="font-display text-lg font-semibold">Comparação entre lojas</h2>
              <p className="text-xs text-muted-foreground">Venda do produto por loja na data referência.</p>
              <div className="mt-4 h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={(analysisData.byStore as StorePoint[]).slice(0, 12)} layout="vertical" margin={{ left: 8 }}>
                    <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={120} />
                    <Tooltip formatter={(v: number) => fmtBRL(v)} />
                    <Bar dataKey="val" fill="oklch(0.48 0.12 165)" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="kpi-card">
              <h2 className="font-display text-lg font-semibold">Evolução de vendas</h2>
              <p className="text-xs text-muted-foreground">Últimas datas com venda registrada.</p>
              <div className="mt-4 h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={analysisData.evolution}>
                    <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.92 0.01 240)" />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
                    <Tooltip formatter={(v: number) => fmtBRL(v)} />
                    <Line type="monotone" dataKey="val" stroke="oklch(0.32 0.09 265)" strokeWidth={2.5} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </section>

          <section className="mt-6 grid gap-4 lg:grid-cols-2">
            <div className="kpi-card">
              <h2 className="font-display text-lg font-semibold">Últimas 4 {refWeekday?.toLowerCase()}s</h2>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
                      <th className="py-2">Data</th>
                      <th className="py-2 text-right">Venda</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(analysisData.lastFourSameWeekday as SeriesPoint[]).map((d) => (
                      <tr key={d.date} className="border-b border-border/60">
                        <td className="py-2">{new Date(d.date + "T00:00:00").toLocaleDateString("pt-BR")}</td>
                        <td className="num py-2 text-right font-medium">{fmtBRL(d.val)}</td>
                      </tr>
                    ))}
                    {analysisData.lastFourSameWeekday.length === 0 && (
                      <tr><td colSpan={2} className="py-4 text-center text-xs text-muted-foreground">Sem histórico suficiente.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="kpi-card">
              <h2 className="font-display text-lg font-semibold">Últimas 4 datas</h2>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
                      <th className="py-2">Data</th>
                      <th className="py-2 text-right">Venda</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(analysisData.lastFourAll as SeriesPoint[]).map((d) => (
                      <tr key={d.date} className="border-b border-border/60">
                        <td className="py-2">{new Date(d.date + "T00:00:00").toLocaleDateString("pt-BR")}</td>
                        <td className="num py-2 text-right font-medium">{fmtBRL(d.val)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
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
