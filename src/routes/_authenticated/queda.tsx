import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getProductsInDecline, getFilterOptions } from "@/lib/analytics.functions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle, AlertCircle, AlertOctagon, PackageX, TrendingDown, Loader2 } from "lucide-react";
import { fmtBRL } from "@/components/kpi-card";

export const Route = createFileRoute("/_authenticated/queda")({
  component: QuedaPage,
});

type Row = Awaited<ReturnType<ReturnType<typeof useServerFn<typeof getProductsInDecline>>>>[number];

const STATUS_META: Record<string, { label: string; color: string; bg: string; icon: any }> = {
  critico:     { label: "Crítico",     color: "text-red-700",    bg: "bg-red-50 border-red-300",       icon: AlertOctagon },
  alerta:      { label: "Alerta",      color: "text-orange-700", bg: "bg-orange-50 border-orange-300", icon: AlertCircle },
  atencao:     { label: "Atenção",     color: "text-amber-700",  bg: "bg-amber-50 border-amber-300",   icon: AlertTriangle },
  sem_estoque: { label: "Sem estoque", color: "text-slate-600",  bg: "bg-slate-50 border-slate-300",   icon: PackageX },
};

function todayIso() { return new Date().toISOString().slice(0, 10); }
function shiftIso(iso: string, days: number) {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function QuedaPage() {
  const getOpts = useServerFn(getFilterOptions);
  const getDecline = useServerFn(getProductsInDecline);

  const { data: opts } = useQuery({
    queryKey: ["filter-options-all"],
    queryFn: () => getOpts({ data: { dateFrom: null, dateTo: null } }),
  });

  const latest = opts?.latestDate ?? todayIso();
  const [dateTo, setDateTo] = useState<string>(latest);
  const [dateFrom, setDateFrom] = useState<string>(shiftIso(latest, -6));
  const [store, setStore] = useState("__all__");
  const [depto, setDepto] = useState("__all__");
  const [secao, setSecao] = useState("__all__");
  const [statusFilter, setStatusFilter] = useState<"all" | "critico" | "alerta" | "atencao" | "sem_estoque">("all");

  // Re-init from latest once it loads
  useMemo(() => {
    if (opts?.latestDate && dateTo === todayIso()) {
      setDateTo(opts.latestDate);
      setDateFrom(shiftIso(opts.latestDate, -6));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts?.latestDate]);

  const stores = (opts?.stores ?? []) as { store_code: string; store_name: string }[];
  const deptos = (opts?.deptos ?? []) as string[];
  const secoes = (opts?.secoes ?? []) as string[];

  const { data, isFetching } = useQuery({
    queryKey: ["products-decline", dateFrom, dateTo, store, depto, secao],
    queryFn: () => getDecline({ data: {
      dateFrom, dateTo,
      stores: store === "__all__" ? [] : [store],
      deptos: depto === "__all__" ? [] : [depto],
      secoes: secao === "__all__" ? [] : [secao],
    } }),
    enabled: !!dateFrom && !!dateTo,
  });

  const rows = (data ?? []) as Row[];
  const filtered = statusFilter === "all" ? rows : rows.filter((r) => r.status === statusFilter);

  const counts = useMemo(() => ({
    critico: rows.filter((r) => r.status === "critico").length,
    alerta: rows.filter((r) => r.status === "alerta").length,
    atencao: rows.filter((r) => r.status === "atencao").length,
    sem_estoque: rows.filter((r) => r.status === "sem_estoque").length,
  }), [rows]);

  const setPreset = (days: number) => {
    const to = opts?.latestDate ?? todayIso();
    setDateTo(to);
    setDateFrom(shiftIso(to, -(days - 1)));
  };

  return (
    <div>
      <header className="mb-6">
        <h1 className="font-display text-3xl font-bold flex items-center gap-2">
          <TrendingDown className="size-7 text-primary" /> Produtos em Queda
        </h1>
        <p className="text-sm text-muted-foreground">
          Análise de produtos com estoque disponível que perderam desempenho. Compara últimos dias vs média 30 dias.
        </p>
      </header>

      <div className="kpi-card mb-4 space-y-3">
        <div className="grid gap-3 md:grid-cols-5">
          <div>
            <Label className="text-xs">De</Label>
            <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="mt-1 h-9" />
          </div>
          <div>
            <Label className="text-xs">Até</Label>
            <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="mt-1 h-9" />
          </div>
          <div>
            <Label className="text-xs">Loja</Label>
            <Select value={store} onValueChange={(v) => { setStore(v); setDepto("__all__"); setSecao("__all__"); }}>
              <SelectTrigger className="mt-1 h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todas</SelectItem>
                {stores.map((s) => <SelectItem key={s.store_code} value={s.store_code}>{s.store_code} — {s.store_name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Departamento</Label>
            <Select value={depto} onValueChange={(v) => { setDepto(v); setSecao("__all__"); }}>
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
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-muted-foreground">Atalhos:</span>
          <Button size="sm" variant="outline" onClick={() => setPreset(1)}>Ontem</Button>
          <Button size="sm" variant="outline" onClick={() => setPreset(7)}>Últimos 7 dias</Button>
          <Button size="sm" variant="outline" onClick={() => setPreset(30)}>Últimos 30 dias</Button>
        </div>
      </div>

      <div className="mb-4 grid gap-3 grid-cols-2 md:grid-cols-4">
        {(["critico", "alerta", "atencao", "sem_estoque"] as const).map((s) => {
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
                <th className="py-2 text-right">Estoque</th>
                <th className="py-2 text-right">Méd. hist./dia</th>
                <th className="py-2 text-right">Méd. atual/dia</th>
                <th className="py-2 text-right">Variação</th>
                <th className="py-2 text-right">Última venda</th>
                <th className="py-2 text-right">Dias sem venda</th>
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
                    <td className="num py-2 text-right">{r.current_stock != null ? r.current_stock.toLocaleString("pt-BR", { maximumFractionDigits: 1 }) : "—"}</td>
                    <td className="num py-2 text-right">{r.avg_daily_hist != null ? fmtBRL(r.avg_daily_hist) : "—"}</td>
                    <td className="num py-2 text-right">{r.avg_daily_recent != null ? fmtBRL(r.avg_daily_recent) : "—"}</td>
                    <td className={`num py-2 text-right font-semibold ${r.variation != null && r.variation < 0 ? "text-red-600" : ""}`}>
                      {r.variation != null ? `${(r.variation * 100).toFixed(1)}%` : "—"}
                    </td>
                    <td className="py-2 text-right text-xs">{r.last_sale_date ? new Date(r.last_sale_date + "T00:00:00").toLocaleDateString("pt-BR") : "—"}</td>
                    <td className="num py-2 text-right">{r.days_without_sale ?? "—"}</td>
                  </tr>
                );
              })}
              {filtered.length === 0 && !isFetching && (
                <tr><td colSpan={9} className="py-8 text-center text-sm text-muted-foreground">Nenhum produto encontrado para os filtros selecionados.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          <strong>Crítico:</strong> com estoque, histórico consistente e venda zerada. <strong>Alerta:</strong> queda &gt; 70%. <strong>Atenção:</strong> queda 40–70%. Produtos sem estoque não são alertados.
        </p>
      </div>
    </div>
  );
}
