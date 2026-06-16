import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getProductsInDecline, getFilterOptions, searchProducts } from "@/lib/analytics.functions";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle, AlertCircle, AlertOctagon, TrendingDown, Loader2, Search, X } from "lucide-react";
import { fmtBRL } from "@/components/kpi-card";
import { DateRangePicker, computePreset } from "@/components/date-range-picker";
import { usePersistentState } from "@/hooks/use-persistent-state";
import { fmtBRShort } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/queda")({
  component: QuedaPage,
});

type Row = {
  store_code: string; store_name: string;
  prod_code: string; prod_name: string;
  depto: string | null; secao: string | null;
  avg_daily_hist: number | null; avg_daily_recent: number | null;
  sum_recent: number; sum_hist: number;
  variation: number | null;
  days_without_sale: number | null;
  last_sale_date: string | null;
  status: "critico" | "alerta" | "atencao";
};

const STATUS_META: Record<string, { label: string; color: string; bg: string; icon: any }> = {
  critico: { label: "Crítico", color: "text-red-700",    bg: "bg-red-50 border-red-300",       icon: AlertOctagon },
  alerta:  { label: "Alerta",  color: "text-orange-700", bg: "bg-orange-50 border-orange-300", icon: AlertCircle },
  atencao: { label: "Atenção", color: "text-amber-700",  bg: "bg-amber-50 border-amber-300",   icon: AlertTriangle },
};

function todayIso() { return new Date().toISOString().slice(0, 10); }
function shiftIso(iso: string, days: number) {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function trend(variation: number | null): string {
  if (variation == null) return "—";
  if (variation <= -0.7) return "📉 Forte queda";
  if (variation <= -0.4) return "📉 Em queda";
  if (variation <= -0.1) return "↘ Leve queda";
  if (variation >= 0.1) return "↗ Crescimento";
  return "→ Estável";
}

function insight(r: Row): string {
  if (r.status === "critico") return "Produto com histórico de vendas e sem vendas no período analisado.";
  if (r.days_without_sale != null && r.days_without_sale >= 7) return `Sem venda há ${r.days_without_sale} dias.`;
  if (r.variation != null && r.variation <= -0.7) return "Venda atual muito abaixo da média histórica.";
  if (r.variation != null && r.variation <= -0.4) return "Tendência de queda nas últimas semanas.";
  return "Queda em relação à média histórica.";
}

function QuedaPage() {
  const getOpts = useServerFn(getFilterOptions);
  const getDecline = useServerFn(getProductsInDecline);
  const search = useServerFn(searchProducts);

  type QFilters = {
    dateFrom: string; dateTo: string;
    store: string; depto: string; secao: string;
    statusFilter: "all" | "critico" | "alerta" | "atencao";
  };
  const [qf, setQf] = usePersistentState<QFilters>("bench-gpa:filters:queda", {
    dateFrom: shiftIso(todayIso(), -6),
    dateTo: todayIso(),
    store: "__all__", depto: "__all__", secao: "__all__",
    statusFilter: "all",
  });
  const setStore = (v: string) => setQf({ ...qf, store: v, depto: "__all__", secao: "__all__" });
  const setDepto = (v: string) => setQf({ ...qf, depto: v, secao: "__all__" });
  const setSecao = (v: string) => setQf({ ...qf, secao: v });
  const setRange = (r: { from: string; to: string }) => setQf({ ...qf, dateFrom: r.from, dateTo: r.to });
  const setStatusFilter = (s: QFilters["statusFilter"]) => setQf({ ...qf, statusFilter: s });
  const { dateFrom, dateTo, store, depto, secao, statusFilter } = qf;
  const [prodQuery, setProdQuery] = useState("");
  const [prodSelected, setProdSelected] = useState<{ prod_code: string; prod_name: string } | null>(null);

  const { data: opts } = useQuery({
    queryKey: ["filter-options-queda", store, depto, secao],
    queryFn: () => getOpts({ data: {
      dateFrom: null, dateTo: null,
      stores: store !== "__all__" ? [store] : [],
      deptos: depto !== "__all__" ? [depto] : [],
      secoes: secao !== "__all__" ? [secao] : [],
    } }),
    staleTime: 5 * 60_000,
  });

  useEffect(() => {
    if (opts?.latestDate && (!dateFrom || !dateTo)) {
      const avail = (opts?.availableDates ?? []) as string[];
      // start from latest available, walk back up to 7 days within available set
      const latest = opts.latestDate;
      const window = avail.filter((d) => d <= latest).slice(-7);
      const from = window[0] ?? latest;
      setRange({ from, to: latest });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts?.latestDate]);

  // Clamp selection to available dates whenever filters narrow the dataset
  useEffect(() => {
    const avail = (opts?.availableDates ?? []) as string[];
    if (!avail.length || !dateFrom || !dateTo) return;
    const within = avail.filter((d) => d >= dateFrom && d <= dateTo);
    if (within.length === 0) {
      const latest = opts!.latestDate!;
      setRange({ from: latest, to: latest });
    } else if (within[0] !== dateFrom || within[within.length - 1] !== dateTo) {
      setRange({ from: within[0], to: within[within.length - 1] });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts?.availableDates]);

  const stores = (opts?.stores ?? []) as { store_code: string; store_name: string }[];
  const deptos = (opts?.deptos ?? []) as string[];
  const secoes = (opts?.secoes ?? []) as string[];

  const { data: suggestions } = useQuery({
    queryKey: ["product-search-queda", prodQuery],
    queryFn: () => search({ data: { q: prodQuery } }),
    enabled: prodQuery.length >= 3 && !prodSelected,
  });

  const { data, isFetching } = useQuery({
    queryKey: ["products-decline", dateFrom, dateTo, store, depto, secao, prodSelected?.prod_code],
    queryFn: () => getDecline({ data: {
      dateFrom, dateTo,
      stores: store === "__all__" ? [] : [store],
      deptos: depto === "__all__" ? [] : [depto],
      secoes: secao === "__all__" ? [] : [secao],
      prodCodes: prodSelected ? [prodSelected.prod_code] : [],
    } }),
    enabled: !!dateFrom && !!dateTo,
  });

  const rows = (data ?? []) as Row[];
  const filtered = statusFilter === "all" ? rows : rows.filter((r) => r.status === statusFilter);

  const counts = useMemo(() => ({
    critico: rows.filter((r) => r.status === "critico").length,
    alerta: rows.filter((r) => r.status === "alerta").length,
    atencao: rows.filter((r) => r.status === "atencao").length,
  }), [rows]);

  // (Quick presets now live inside DateRangePicker)

  const activeChips: Array<{ label: string; onClear: () => void }> = [];
  if (store !== "__all__") {
    const s = stores.find((x) => x.store_code === store);
    activeChips.push({ label: `Loja: ${s ? `${s.store_code} — ${s.store_name}` : store}`, onClear: () => setStore("__all__") });
  }
  if (depto !== "__all__") activeChips.push({ label: `Depto: ${depto}`, onClear: () => setDepto("__all__") });
  if (secao !== "__all__") activeChips.push({ label: `Seção: ${secao}`, onClear: () => setSecao("__all__") });
  if (prodSelected) activeChips.push({ label: `Produto: ${prodSelected.prod_name}`, onClear: () => { setProdSelected(null); setProdQuery(""); } });

  return (
    <div>
      <header className="mb-6">
        <h1 className="font-display text-3xl font-bold flex items-center gap-2">
          <TrendingDown className="size-7 text-primary" /> Produtos em Queda
        </h1>
        <p className="text-sm text-muted-foreground">
          Produtos com redução significativa nas vendas em relação ao próprio histórico (média 30 dias anteriores ao período).
        </p>
      </header>

      <div className="kpi-card mb-4 space-y-3">
        <div className="grid gap-3 md:grid-cols-4">
          <div className="md:col-span-1">
            <Label className="text-xs">Período</Label>
            <div className="mt-1">
              <DateRangePicker
                from={dateFrom}
                to={dateTo}
                reference={opts?.latestDate ?? undefined}
                availableDates={opts?.availableDates ?? []}
                onChange={setRange}
              />
            </div>
          </div>
          <div>
            <Label className="text-xs">Loja</Label>
            <Select value={store} onValueChange={setStore}>
              <SelectTrigger className="mt-1 h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todas</SelectItem>
                {stores.map((s) => <SelectItem key={s.store_code} value={s.store_code}>{s.store_code} — {s.store_name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Departamento</Label>
            <Select value={depto} onValueChange={setDepto}>
              <SelectTrigger className="mt-1 h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todos</SelectItem>
                {deptos.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Seção</Label>
            <Select value={secao} onValueChange={setSecao}>
              <SelectTrigger className="mt-1 h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todas</SelectItem>
                {secoes.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="relative">
          <Label className="text-xs">Produto</Label>
          <div className="mt-1 flex items-center gap-2 rounded-md border border-input bg-background px-2 h-9">
            <Search className="size-4 text-muted-foreground" />
            <input
              placeholder="Buscar produto (3+ caracteres)…"
              value={prodSelected ? `${prodSelected.prod_code} — ${prodSelected.prod_name}` : prodQuery}
              onChange={(e) => { setProdQuery(e.target.value); setProdSelected(null); }}
              className="h-full flex-1 bg-transparent text-sm outline-none"
            />
            {prodSelected && (
              <button onClick={() => { setProdSelected(null); setProdQuery(""); }}>
                <X className="size-4 text-muted-foreground" />
              </button>
            )}
          </div>
          {!prodSelected && prodQuery.length >= 3 && suggestions && suggestions.length > 0 && (
            <ul className="absolute left-0 right-0 top-full z-20 mt-1 max-h-60 overflow-y-auto rounded-lg border border-border bg-popover shadow-lg">
              {suggestions.map((s) => (
                <li key={s.prod_code}>
                  <button
                    onClick={() => { setProdSelected(s); setProdQuery(""); }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted"
                  >
                    <span className="font-mono text-xs text-muted-foreground">{s.prod_code}</span>
                    <span className="truncate">{s.prod_name}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {activeChips.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 border-t pt-3">
            <span className="text-xs text-muted-foreground">Filtros ativos:</span>
            {activeChips.map((c, i) => (
              <button key={i} onClick={c.onClear} className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/5 px-2 py-0.5 text-xs text-primary hover:bg-primary/10">
                {c.label} <X className="size-3" />
              </button>
            ))}
            <button
              onClick={() => { setStore("__all__"); setDepto("__all__"); setSecao("__all__"); setProdSelected(null); setProdQuery(""); }}
              className="ml-1 text-xs text-muted-foreground underline hover:text-foreground"
            >
              Limpar tudo
            </button>
          </div>
        )}
      </div>

      <div className="mb-4 grid gap-3 grid-cols-1 md:grid-cols-3">
        {(["critico", "alerta", "atencao"] as const).map((s) => {
          const meta = STATUS_META[s];
          const Icon = meta.icon;
          const active = statusFilter === s;
          return (
            <button
              key={s}
              onClick={() => setStatusFilter(active ? "all" : s)}
              className={`kpi-card text-left transition ${active ? "ring-2 ring-primary" : "hover:shadow-md"}`}
            >
              <div className={`flex items-center gap-2 ${meta.color}`}>
                <Icon className="size-4" />
                <span className="text-xs font-semibold uppercase tracking-wider">{meta.label}</span>
              </div>
              <div className="mt-2 font-display text-2xl font-bold">{counts[s]}</div>
            </button>
          );
        })}
      </div>

      <div className="kpi-card">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold">
            {statusFilter === "all" ? "Todos os produtos" : STATUS_META[statusFilter].label} ({filtered.length})
          </h2>
          {isFetching && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="py-2">Status</th>
                <th className="py-2">Produto</th>
                <th className="py-2">Loja</th>
                <th className="py-2 text-right">Méd. hist./dia</th>
                <th className="py-2 text-right">Méd. atual/dia</th>
                <th className="py-2 text-right">Variação</th>
                <th className="py-2 text-right">Última venda</th>
                <th className="py-2 text-right">Dias sem venda</th>
                <th className="py-2">Tendência</th>
                <th className="py-2">Insight</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r, i) => {
                const meta = STATUS_META[r.status] ?? STATUS_META.atencao;
                return (
                  <tr key={i} className="border-b border-border/60 hover:bg-muted/30">
                    <td className="py-2">
                      <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${meta.bg} ${meta.color}`}>
                        {meta.label}
                      </span>
                    </td>
                    <td className="py-2">
                      <div className="font-medium">{r.prod_name}</div>
                      <div className="text-xs text-muted-foreground font-mono">{r.prod_code} · {r.depto ?? "-"}</div>
                    </td>
                    <td className="py-2 text-xs">{r.store_code}<br /><span className="text-muted-foreground">{r.store_name}</span></td>
                    <td className="num py-2 text-right">{r.avg_daily_hist != null ? fmtBRL(r.avg_daily_hist) : "—"}</td>
                    <td className="num py-2 text-right">{r.avg_daily_recent != null ? fmtBRL(r.avg_daily_recent) : "—"}</td>
                    <td className={`num py-2 text-right font-semibold ${r.variation != null && r.variation < 0 ? "text-red-600" : ""}`}>
                      {r.variation != null ? `${(r.variation * 100).toFixed(1)}%` : "—"}
                    </td>
                    <td className="py-2 text-right text-xs whitespace-nowrap">{fmtBRShort(r.last_sale_date)}</td>
                    <td className="num py-2 text-right">{r.days_without_sale ?? "—"}</td>
                    <td className="py-2 text-xs">{trend(r.variation)}</td>
                    <td className="py-2 text-xs text-muted-foreground max-w-[260px]">{insight(r)}</td>
                  </tr>
                );
              })}
              {filtered.length === 0 && !isFetching && (
                <tr><td colSpan={10} className="py-8 text-center text-sm text-muted-foreground">Nenhum produto encontrado para os filtros selecionados.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          <strong>Crítico:</strong> com histórico recorrente e venda zerada no período. <strong>Alerta:</strong> queda &gt; 70%. <strong>Atenção:</strong> queda 40–70%.
        </p>
      </div>
    </div>
  );
}
