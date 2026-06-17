import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useRef, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { searchProducts, getProductAnalysis, getFilterOptions } from "@/lib/analytics.functions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { KpiCard, fmtBRL } from "@/components/kpi-card";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, LineChart, Line, CartesianGrid } from "recharts";
import { Search, Package, X, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fmtBRShort } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/produto")({
  validateSearch: (s: Record<string, unknown>) => ({ plu: typeof s.plu === "string" ? s.plu : undefined }),
  component: ProdutoPage,
});

const WEEKDAYS_FULL = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];
const WEEKDAYS_PLURAL = ["Domingos", "Segundas-feiras", "Terças-feiras", "Quartas-feiras", "Quintas-feiras", "Sextas-feiras", "Sábados"];
// Masculino: Domingo (0), Sábado (6). Demais: feminino.
const WEEKDAY_IS_MASC = [true, false, false, false, false, false, true];

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

  const refWeekdayIdx = analysisData?.refDate ? new Date(analysisData.refDate + "T00:00:00Z").getUTCDay() : null;
  const refWeekdayFull = refWeekdayIdx != null ? WEEKDAYS_FULL[refWeekdayIdx] : null;
  const refWeekdayPlural = refWeekdayIdx != null ? WEEKDAYS_PLURAL[refWeekdayIdx] : null;
  const refArticle = refWeekdayIdx != null ? (WEEKDAY_IS_MASC[refWeekdayIdx] ? "Últimos" : "Últimas") : "Últimas";

  const sameWeekdayAll = useMemo<SeriesPoint[]>(() => {
    if (!analysisData?.evolution || refWeekdayIdx == null) return [];
    return (analysisData.evolution as SeriesPoint[])
      .filter((d) => new Date(d.date + "T00:00:00Z").getUTCDay() === refWeekdayIdx)
      .sort((a, b) => (a.date < b.date ? 1 : -1));
  }, [analysisData?.evolution, refWeekdayIdx]);

  const avgSame = sameWeekdayAll.length
    ? sameWeekdayAll.reduce((a, b) => a + b.val, 0) / sameWeekdayAll.length
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
          {(query.length > 0 || selected) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { setQuery(""); setSelected(null); setDebounced(""); }}
              className="h-7 gap-1 text-xs text-muted-foreground"
            >
              <X className="size-3" /> Limpar
            </Button>
          )}
          {selected && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => { setSelected(null); setQuery(""); setDebounced(""); }}
              className="h-7 text-xs"
            >
              Trocar produto
            </Button>
          )}
        </div>
        {selected && (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/5 px-2 py-0.5 text-xs text-primary">
              <Package className="size-3" />
              <span className="font-mono">{selected.prod_code}</span>
              <span className="truncate max-w-[260px]">{selected.prod_name}</span>
            </span>
          </div>
        )}
        {!selected && debounced.length >= 3 && suggestions && suggestions.length > 0 && (
          <ul className="absolute left-0 right-0 top-full z-20 mt-1 max-h-80 overflow-y-auto rounded-lg border border-border bg-popover shadow-lg">
            {suggestions.map((s) => (
              <li key={s.prod_code}>
                <button
                  onClick={() => { setSelected(s); setQuery(""); }}
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
          <section className="mt-6 grid gap-4 md:grid-cols-2">
            <KpiCard label="Venda na data referência" value={fmtBRL(analysisData.refValue ?? 0)} hint={analysisData.refDate ? `${refWeekdayFull} · ${fmtBRShort(analysisData.refDate)}` : undefined} />
            <KpiCard label={`Média de ${refWeekdayPlural?.toLowerCase() ?? "datas anteriores"}`} value={fmtBRL(avgSame)} delta={avgSame > 0 ? ((analysisData.refValue ?? 0) - avgSame) / avgSame : null} hint={`Todos os ${refWeekdayPlural?.toLowerCase() ?? ""} do histórico`} />
          </section>

          <section className="mt-6 grid gap-4 lg:grid-cols-2">
            <div className="kpi-card">
              <h2 className="font-display text-lg font-semibold">Comparação entre lojas</h2>
              <p className="text-xs text-muted-foreground">Venda do produto por loja na data referência.</p>
              <div className="mt-4 h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={(analysisData.byStore as StorePoint[]).slice(0, 12)} margin={{ left: 8, right: 8, bottom: 28 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.92 0.01 240)" />
                    <XAxis dataKey="code" tick={{ fontSize: 10 }} interval={0} angle={-30} textAnchor="end" height={50} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
                    <Tooltip formatter={(v: number) => fmtBRL(v)} labelFormatter={(label, payload) => {
                      const p = payload?.[0]?.payload as StorePoint | undefined;
                      return p ? `${p.code} — ${p.name}` : String(label);
                    }} />
                    <Bar dataKey="val" fill="oklch(0.48 0.12 165)" radius={[4, 4, 0, 0]} />
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
                    <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.92 0.01 240)" />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(v) => fmtBRShort(String(v))} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
                    <Tooltip formatter={(v: number) => fmtBRL(v)} labelFormatter={(v) => fmtBRShort(String(v))} />
                    <Line type="monotone" dataKey="val" stroke="oklch(0.32 0.09 265)" strokeWidth={2.5} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </section>

          <PaginatedHistory
            title={`${refArticle} ${refWeekdayPlural?.toLowerCase() ?? "datas"}`}
            rows={sameWeekdayAll}
          />

          <PaginatedHistory title="Histórico completo" rows={analysisData.evolution as SeriesPoint[]} />

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

function PaginatedHistory({ title, rows }: { title: string; rows: SeriesPoint[] }) {
  const sorted = useMemo(
    () => [...rows].sort((a, b) => (a.date < b.date ? 1 : -1)),
    [rows]
  );
  const PAGE = 10;
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE));
  const start = (page - 1) * PAGE;
  const slice = sorted.slice(start, start + PAGE);

  return (
    <section className="mt-6 kpi-card">
      <div className="mb-3 flex items-center justify-between gap-3 flex-wrap">
        <h2 className="font-display text-lg font-semibold">{title}</h2>
        <span className="text-xs text-muted-foreground">
          {sorted.length} registro(s) · página {page} de {totalPages}
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
              <th className="py-2">Data</th>
              <th className="py-2 text-right">Venda</th>
            </tr>
          </thead>
          <tbody>
            {slice.map((d) => (
              <tr key={d.date} className="border-b border-border/60">
                <td className="py-2 whitespace-nowrap">{fmtBRShort(d.date)}</td>
                <td className="num py-2 text-right font-medium">{fmtBRL(d.val)}</td>
              </tr>
            ))}
            {sorted.length === 0 && (
              <tr><td colSpan={2} className="py-6 text-center text-xs text-muted-foreground">Sem histórico disponível.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <div className="mt-3 flex items-center justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>
            <ChevronLeft className="size-3 mr-1" /> Anterior
          </Button>
          <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}>
            Próxima <ChevronRight className="size-3 ml-1" />
          </Button>
        </div>
      )}
    </section>
  );
}

