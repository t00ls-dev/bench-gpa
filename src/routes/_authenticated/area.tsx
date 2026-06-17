import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getAreaAnalysis, getFilterOptions } from "@/lib/analytics.functions";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { KpiCard, fmtBRL, fmtInt } from "@/components/kpi-card";
import { DateRangePicker } from "@/components/date-range-picker";
import { usePersistentState } from "@/hooks/use-persistent-state";
import { fmtBRShort } from "@/lib/utils";
import {
  BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid,
  LineChart, Line, PieChart, Pie, Cell, Legend,
} from "recharts";
import {
  Layers, X, ChevronLeft, ChevronRight, ChevronUp, ChevronDown, Search,
  Download, TrendingUp, TrendingDown as TDown, Minus, AlertCircle, Loader2,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/area")({
  component: AreaPage,
});

type Product = {
  prod_code: string; prod_name: string;
  depto: string | null; secao: string | null; grupo: string | null; subgrupo: string | null;
  val: number; qty: number; prev_val: number;
  cur_rank: number | null; prev_rank: number | null;
};

type AbcClass = "A" | "B" | "C";
type SortKey = "rank" | "prod_code" | "prod_name" | "val" | "qty" | "share" | "abc" | "delta";

const ALL = "__all__";
const ABC_COLORS: Record<AbcClass, string> = {
  A: "oklch(0.55 0.18 145)",
  B: "oklch(0.7 0.15 80)",
  C: "oklch(0.65 0.18 25)",
};

function pct(n: number) { return `${(n * 100).toFixed(1)}%`; }
function todayIso() { return new Date().toISOString().slice(0, 10); }
function shiftIso(iso: string, days: number) {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
function diffDays(from: string, to: string) {
  const f = new Date(from + "T00:00:00Z").getTime();
  const t = new Date(to + "T00:00:00Z").getTime();
  return Math.round((t - f) / 86400000);
}

function downloadCsv(filename: string, rows: (string | number)[][]) {
  const csv = rows
    .map((r) => r.map((c) => {
      const s = String(c ?? "");
      return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    }).join(";"))
    .join("\n");
  const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function AreaPage() {
  const navigate = useNavigate();
  const getOpts = useServerFn(getFilterOptions);
  const getArea = useServerFn(getAreaAnalysis);

  type AF = {
    dateFrom: string; dateTo: string;
    store: string; depto: string; secao: string; grupo: string; subgrupo: string;
    compare: boolean;
  };
  const [af, setAf] = usePersistentState<AF>("bench-gpa:filters:area", {
    dateFrom: "", dateTo: "",
    store: ALL, depto: ALL, secao: ALL, grupo: ALL, subgrupo: ALL,
    compare: true,
  });
  const setStore = (v: string) => setAf({ ...af, store: v, depto: ALL, secao: ALL, grupo: ALL, subgrupo: ALL });
  const setDepto = (v: string) => setAf({ ...af, depto: v, secao: ALL, grupo: ALL, subgrupo: ALL });
  const setSecao = (v: string) => setAf({ ...af, secao: v, grupo: ALL, subgrupo: ALL });
  const setGrupo = (v: string) => setAf({ ...af, grupo: v, subgrupo: ALL });
  const setSubgrupo = (v: string) => setAf({ ...af, subgrupo: v });
  const setRange = (r: { from: string; to: string }) => setAf({ ...af, dateFrom: r.from, dateTo: r.to });
  const { dateFrom, dateTo, store, depto, secao, grupo, subgrupo, compare } = af;

  const { data: opts } = useQuery({
    queryKey: ["filter-options-area", store, depto, secao, grupo],
    queryFn: () => getOpts({ data: {
      dateFrom: null, dateTo: null,
      stores: store !== ALL ? [store] : [],
      deptos: depto !== ALL ? [depto] : [],
      secoes: secao !== ALL ? [secao] : [],
      grupos: grupo !== ALL ? [grupo] : [],
    } }),
    staleTime: 5 * 60_000,
  });

  useEffect(() => {
    if (opts?.latestDate && (!dateFrom || !dateTo)) {
      const avail = (opts?.availableDates ?? []) as string[];
      const latest = opts.latestDate;
      const window = avail.filter((d) => d <= latest).slice(-7);
      setRange({ from: window[0] ?? latest, to: latest });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts?.latestDate]);

  useEffect(() => {
    const avail = (opts?.availableDates ?? []) as string[];
    if (!avail.length || !dateFrom || !dateTo) return;
    const within = avail.filter((d) => d >= dateFrom && d <= dateTo);
    if (within.length === 0 && opts?.latestDate) {
      setRange({ from: opts.latestDate, to: opts.latestDate });
    } else if (within.length && (within[0] !== dateFrom || within[within.length - 1] !== dateTo)) {
      setRange({ from: within[0], to: within[within.length - 1] });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts?.availableDates]);

  const stores = (opts?.stores ?? []) as { store_code: string; store_name: string }[];
  const deptos = (opts?.deptos ?? []) as string[];
  const secoes = (opts?.secoes ?? []) as string[];
  const grupos = (opts?.grupos ?? []) as string[];
  const subgrupos = (opts?.subgrupos ?? []) as string[];

  const prevRange = useMemo(() => {
    if (!compare || !dateFrom || !dateTo) return null;
    const days = diffDays(dateFrom, dateTo) + 1;
    return { from: shiftIso(dateFrom, -days), to: shiftIso(dateTo, -days) };
  }, [compare, dateFrom, dateTo]);

  const { data, isFetching } = useQuery({
    queryKey: ["area-analysis", dateFrom, dateTo, store, depto, secao, grupo, subgrupo, prevRange?.from, prevRange?.to],
    queryFn: () => getArea({ data: {
      dateFrom, dateTo,
      store: store !== ALL ? store : null,
      depto: depto !== ALL ? depto : null,
      secao: secao !== ALL ? secao : null,
      grupo: grupo !== ALL ? grupo : null,
      subgrupo: subgrupo !== ALL ? subgrupo : null,
      prevFrom: prevRange?.from ?? null,
      prevTo: prevRange?.to ?? null,
    } }),
    enabled: !!dateFrom && !!dateTo,
  });

  const products = (data?.products ?? []) as Product[];
  const total = data?.total ?? 0;
  const prevTotal = data?.prevTotal ?? 0;

  // ABC + accumulated share
  const enriched = useMemo(() => {
    const sorted = [...products].sort((a, b) => b.val - a.val);
    let acc = 0;
    return sorted.map((p, i) => {
      const share = total > 0 ? p.val / total : 0;
      acc += share;
      const abc: AbcClass = acc <= 0.8 ? "A" : acc <= 0.95 ? "B" : "C";
      const delta = p.prev_val > 0 ? (p.val - p.prev_val) / p.prev_val : (p.val > 0 ? 1 : 0);
      const rankDelta = p.prev_rank != null && p.cur_rank != null ? p.prev_rank - p.cur_rank : null;
      return { ...p, rank: i + 1, share, acc, abc, delta, rankDelta };
    });
  }, [products, total]);

  type Row = (typeof enriched)[number];

  const abcCounts = useMemo(() => {
    const c = { A: 0, B: 0, C: 0 } as Record<AbcClass, number>;
    const v = { A: 0, B: 0, C: 0 } as Record<AbcClass, number>;
    for (const p of enriched) { c[p.abc]++; v[p.abc] += p.val; }
    return { c, v };
  }, [enriched]);

  const concentration = useMemo(() => {
    const sums = [1, 5, 10, 20].map((n) => enriched.slice(0, n).reduce((s, p) => s + p.val, 0));
    return {
      top1: total > 0 ? sums[0] / total : 0,
      top5: total > 0 ? sums[1] / total : 0,
      top10: total > 0 ? sums[2] / total : 0,
      top20: total > 0 ? sums[3] / total : 0,
    };
  }, [enriched, total]);

  const productsTo80 = useMemo(() => enriched.filter((p) => p.acc <= 0.8).length || (enriched[0] ? 1 : 0), [enriched]);

  const noSale = data?.plusWithoutSale ?? 0;
  const lowShare = useMemo(() => enriched.filter((p) => p.share < 0.001 && p.val > 0).length, [enriched]);

  const leader = enriched[0];
  const biggestGainer = useMemo(() => {
    return [...enriched].filter((p) => p.prev_val > 0).sort((a, b) => b.delta - a.delta)[0] ?? null;
  }, [enriched]);
  const biggestLoser = useMemo(() => {
    return [...enriched].filter((p) => p.prev_val > 0).sort((a, b) => a.delta - b.delta)[0] ?? null;
  }, [enriched]);

  const concentrationLabel =
    concentration.top10 >= 0.7 ? "alta concentração"
    : concentration.top10 >= 0.5 ? "concentração moderada"
    : "vendas pulverizadas";

  // Breadcrumb path
  const pathParts: string[] = [];
  if (store !== ALL) {
    const s = stores.find((x) => x.store_code === store);
    pathParts.push(`Loja ${s ? `${s.store_code} — ${s.store_name}` : store}`);
  } else {
    pathParts.push("Todas as lojas");
  }
  if (depto !== ALL) pathParts.push(depto);
  if (secao !== ALL) pathParts.push(secao);
  if (grupo !== ALL) pathParts.push(grupo);
  if (subgrupo !== ALL) pathParts.push(subgrupo);

  const activeChips: Array<{ label: string; onClear: () => void }> = [];
  if (store !== ALL) {
    const s = stores.find((x) => x.store_code === store);
    activeChips.push({ label: `Loja: ${s ? `${s.store_code} — ${s.store_name}` : store}`, onClear: () => setStore(ALL) });
  }
  if (depto !== ALL) activeChips.push({ label: `Depto: ${depto}`, onClear: () => setDepto(ALL) });
  if (secao !== ALL) activeChips.push({ label: `Seção: ${secao}`, onClear: () => setSecao(ALL) });
  if (grupo !== ALL) activeChips.push({ label: `Grupo: ${grupo}`, onClear: () => setGrupo(ALL) });
  if (subgrupo !== ALL) activeChips.push({ label: `Subgrupo: ${subgrupo}`, onClear: () => setSubgrupo(ALL) });

  // Table
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("rank");
  const [sortAsc, setSortAsc] = useState(true);
  const [pageSize, setPageSize] = useState<25 | 50 | 100 | 250>(50);
  const [page, setPage] = useState(1);

  useEffect(() => { setPage(1); }, [search, pageSize, sortKey, sortAsc, dateFrom, dateTo, store, depto, secao, grupo, subgrupo]);

  const withSale = useMemo(() => enriched.filter((p) => p.val > 0), [enriched]);
  const filteredTable = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = withSale;
    if (q) list = list.filter((p) => p.prod_code.toLowerCase().includes(q) || p.prod_name.toLowerCase().includes(q));
    const sorted = [...list].sort((a, b) => {
      let av: number | string = 0, bv: number | string = 0;
      switch (sortKey) {
        case "rank": av = a.rank; bv = b.rank; break;
        case "prod_code": av = a.prod_code; bv = b.prod_code; break;
        case "prod_name": av = a.prod_name; bv = b.prod_name; break;
        case "val": av = a.val; bv = b.val; break;
        case "qty": av = a.qty; bv = b.qty; break;
        case "share": av = a.share; bv = b.share; break;
        case "abc": av = a.abc; bv = b.abc; break;
        case "delta": av = a.delta; bv = b.delta; break;
      }
      if (typeof av === "string") return sortAsc ? (av as string).localeCompare(bv as string) : (bv as string).localeCompare(av as string);
      return sortAsc ? (av as number) - (bv as number) : (bv as number) - (av as number);
    });
    return sorted;
  }, [withSale, search, sortKey, sortAsc]);

  const totalRows = filteredTable.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
  const pageRows = filteredTable.slice((page - 1) * pageSize, page * pageSize);

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortAsc(!sortAsc);
    else { setSortKey(k); setSortAsc(k === "rank" || k === "prod_code" || k === "prod_name"); }
  };

  const openProduct = (code: string) => {
    navigate({ to: "/produto", search: { plu: code } });
  };

  const exportCsv = () => {
    const header = ["Ranking","PLU","Descrição","Departamento","Seção","Grupo","Subgrupo","Venda","Ocorrências","Participação %","Acumulada %","ABC","Δ Venda vs Anterior %"];
    const rows: (string | number)[][] = [header];
    for (const p of filteredTable) {
      rows.push([
        p.rank, p.prod_code, p.prod_name,
        p.depto ?? "", p.secao ?? "", p.grupo ?? "", p.subgrupo ?? "",
        p.val.toFixed(2), p.qty,
        (p.share * 100).toFixed(2), (p.acc * 100).toFixed(2),
        p.abc, p.prev_val > 0 ? (p.delta * 100).toFixed(2) : "",
      ]);
    }
    downloadCsv(`area-analise-${dateFrom}_${dateTo}.csv`, rows);
  };

  // Charts data
  const topShareChart = enriched.slice(0, 10).map((p) => ({
    code: p.prod_code, name: p.prod_name, share: p.share * 100, val: p.val,
  }));
  const abcPie = (["A", "B", "C"] as AbcClass[]).map((k) => ({
    name: `Classe ${k}`, value: abcCounts.v[k], count: abcCounts.c[k], key: k,
  }));
  const concentrationChart = [
    { name: "Top 1", val: concentration.top1 * 100 },
    { name: "Top 5", val: concentration.top5 * 100 },
    { name: "Top 10", val: concentration.top10 * 100 },
    { name: "Top 20", val: concentration.top20 * 100 },
  ];
  const byDate = (data?.byDate ?? []) as { date: string; val: number }[];

  const totalDelta = prevTotal > 0 ? (total - prevTotal) / prevTotal : null;

  const ready = !!dateFrom && !!dateTo;

  return (
    <div>
      <header className="mb-6">
        <h1 className="font-display text-3xl font-bold flex items-center gap-2">
          <Layers className="size-7 text-primary" /> Análise de Área
        </h1>
        <p className="text-sm text-muted-foreground">
          Identifique líderes, concentração, curva ABC e oportunidades de sortimento dentro da hierarquia Loja → Departamento → Seção → Grupo → Subgrupo.
        </p>
      </header>

      {/* Filtros */}
      <div className="kpi-card mb-4 space-y-3">
        <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-6">
          <div>
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
                <SelectItem value={ALL}>Todas</SelectItem>
                {stores.map((s) => <SelectItem key={s.store_code} value={s.store_code}>{s.store_code} — {s.store_name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Departamento</Label>
            <Select value={depto} onValueChange={setDepto}>
              <SelectTrigger className="mt-1 h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Todos</SelectItem>
                {deptos.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Seção</Label>
            <Select value={secao} onValueChange={setSecao} disabled={depto === ALL && secoes.length === 0}>
              <SelectTrigger className="mt-1 h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Todas</SelectItem>
                {secoes.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Grupo</Label>
            <Select value={grupo} onValueChange={setGrupo} disabled={grupos.length === 0}>
              <SelectTrigger className="mt-1 h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Todos</SelectItem>
                {grupos.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Subgrupo</Label>
            <Select value={subgrupo} onValueChange={setSubgrupo} disabled={subgrupos.length === 0}>
              <SelectTrigger className="mt-1 h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Todos</SelectItem>
                {subgrupos.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t pt-3">
          <span className="text-xs text-muted-foreground">Filtros ativos:</span>
          {activeChips.length === 0 && <span className="text-xs italic text-muted-foreground">nenhum</span>}
          {activeChips.map((c, i) => (
            <button key={i} onClick={c.onClear} className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/5 px-2 py-0.5 text-xs text-primary hover:bg-primary/10">
              {c.label} <X className="size-3" />
            </button>
          ))}
          <span className="ml-auto text-xs text-muted-foreground whitespace-nowrap">
            Período: <strong>{fmtBRShort(dateFrom)}</strong> a <strong>{fmtBRShort(dateTo)}</strong>
            {prevRange && <> &nbsp;·&nbsp; Anterior: {fmtBRShort(prevRange.from)} a {fmtBRShort(prevRange.to)}</>}
          </span>
          <label className="flex items-center gap-1 text-xs text-muted-foreground">
            <input type="checkbox" checked={compare} onChange={(e) => setAf({ ...af, compare: e.target.checked })} />
            Comparar período anterior
          </label>
        </div>
      </div>

      {/* Caminho da área */}
      <div className="kpi-card mb-4">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">Área analisada</div>
        <div className="mt-1 flex flex-wrap items-center gap-1 font-display text-lg font-semibold">
          {pathParts.map((p, i) => (
            <span key={i} className="flex items-center gap-1">
              {i > 0 && <span className="text-muted-foreground">›</span>}
              <span>{p}</span>
            </span>
          ))}
        </div>
      </div>

      {!ready ? (
        <div className="kpi-card text-center text-muted-foreground">Selecione um período para iniciar a análise.</div>
      ) : (
        <>
          {/* KPIs */}
          <section className="mb-4 grid gap-4 md:grid-cols-3 lg:grid-cols-6">
            <KpiCard label="Venda Total" value={fmtBRL(total)} delta={totalDelta} hint={prevRange ? `vs ${fmtBRL(prevTotal)}` : undefined} />
            <KpiCard label="Ocorrências de Venda" value={fmtInt(data?.occurrences ?? 0)} />
            <KpiCard label="PLUs (área)" value={fmtInt(data?.plusTotal ?? 0)} />
            <KpiCard label="PLUs com venda" value={fmtInt(data?.plusWithSale ?? 0)} />
            <KpiCard label="PLUs sem venda" value={fmtInt(noSale)} />
            <KpiCard label="Venda média por PLU" value={fmtBRL(data?.avgPerPlu ?? 0)} />
          </section>

          {/* Insights */}
          <div className="kpi-card mb-4">
            <h2 className="font-display text-lg font-semibold mb-2">Insights automáticos</h2>
            <ul className="space-y-1.5 text-sm">
              {leader && (
                <li>• Produto líder: <strong>{leader.prod_name}</strong> ({leader.prod_code}) representa <strong>{pct(leader.share)}</strong> das vendas da área.</li>
              )}
              <li>• Os <strong>10 principais</strong> produtos representam <strong>{pct(concentration.top10)}</strong> das vendas da área — <strong>{concentrationLabel}</strong>.</li>
              <li>• <strong>{productsTo80}</strong> {productsTo80 === 1 ? "produto representa" : "produtos representam"} aproximadamente 80% das vendas (Classe A).</li>
              <li>• <strong>{noSale}</strong> {noSale === 1 ? "PLU está sem venda" : "PLUs estão sem venda"} no período analisado.</li>
              <li>• <strong>{lowShare}</strong> {lowShare === 1 ? "produto possui" : "produtos possuem"} participação muito baixa (&lt; 0,1%).</li>
              {biggestGainer && biggestGainer.delta > 0 && (
                <li>• Maior ganho de participação: <strong>{biggestGainer.prod_name}</strong> ({(biggestGainer.delta * 100).toFixed(1)}% vs período anterior).</li>
              )}
              {biggestLoser && biggestLoser.delta < 0 && (
                <li>• Maior perda de participação: <strong>{biggestLoser.prod_name}</strong> ({(biggestLoser.delta * 100).toFixed(1)}% vs período anterior).</li>
              )}
            </ul>
          </div>

          {/* Gráficos */}
          <section className="mb-4 grid gap-4 lg:grid-cols-2">
            <div className="kpi-card">
              <h3 className="font-display text-base font-semibold">Participação dos principais produtos</h3>
              <p className="text-xs text-muted-foreground">Top 10 por venda no período.</p>
              <div className="mt-3 h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={topShareChart} layout="vertical" margin={{ left: 8, right: 16 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.92 0.01 240)" />
                    <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => `${v.toFixed(0)}%`} />
                    <YAxis type="category" dataKey="code" tick={{ fontSize: 11 }} width={80} />
                    <Tooltip
                      formatter={(v: number, _n, p: any) => [`${v.toFixed(2)}%`, p?.payload?.name ?? "Produto"]}
                      labelFormatter={(l) => `PLU ${l}`}
                    />
                    <Bar dataKey="share" fill="oklch(0.55 0.18 250)" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="kpi-card">
              <h3 className="font-display text-base font-semibold">Curva ABC</h3>
              <p className="text-xs text-muted-foreground">A: até 80% · B: próximos 15% · C: últimos 5%.</p>
              <div className="mt-3 h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={abcPie} dataKey="value" nameKey="name" innerRadius={50} outerRadius={90} paddingAngle={2}>
                      {abcPie.map((e) => <Cell key={e.key} fill={ABC_COLORS[e.key]} />)}
                    </Pie>
                    <Tooltip formatter={(v: number, _n, p: any) => [`${fmtBRL(v)} · ${p?.payload?.count} PLUs`, p?.payload?.name]} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-2 grid grid-cols-3 gap-2 text-center text-xs">
                {(["A","B","C"] as AbcClass[]).map((k) => (
                  <div key={k} className="rounded border p-2">
                    <div className="font-semibold" style={{ color: ABC_COLORS[k] }}>Classe {k}</div>
                    <div>{abcCounts.c[k]} PLUs</div>
                    <div className="text-muted-foreground">{pct(total > 0 ? abcCounts.v[k] / total : 0)}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="kpi-card">
              <h3 className="font-display text-base font-semibold">Concentração de vendas</h3>
              <p className="text-xs text-muted-foreground">Quanto os principais produtos representam.</p>
              <div className="mt-3 h-60">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={concentrationChart}>
                    <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.92 0.01 240)" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${v}%`} />
                    <Tooltip formatter={(v: number) => `${v.toFixed(1)}%`} />
                    <Bar dataKey="val" fill="oklch(0.6 0.16 200)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="kpi-card">
              <h3 className="font-display text-base font-semibold">Evolução temporal</h3>
              <p className="text-xs text-muted-foreground">Venda da área ao longo do período.</p>
              <div className="mt-3 h-60">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={byDate}>
                    <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.92 0.01 240)" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(d) => fmtBRShort(d)} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
                    <Tooltip
                      formatter={(v: number) => fmtBRL(v)}
                      labelFormatter={(d) => fmtBRShort(String(d))}
                    />
                    <Line type="monotone" dataKey="val" stroke="oklch(0.55 0.18 145)" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </section>

          {/* Tabela */}
          <div className="kpi-card">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <h2 className="font-display text-lg font-semibold">Produtos da área</h2>
              {isFetching && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
              <div className="ml-auto flex items-center gap-2">
                <div className="flex items-center gap-1 rounded-md border bg-background px-2 h-9">
                  <Search className="size-3.5 text-muted-foreground" />
                  <Input
                    placeholder="Buscar PLU ou descrição…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="h-7 w-56 border-0 px-1 text-sm shadow-none focus-visible:ring-0"
                  />
                </div>
                <Select value={String(pageSize)} onValueChange={(v) => setPageSize(Number(v) as any)}>
                  <SelectTrigger className="h-9 w-[110px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="25">25 / página</SelectItem>
                    <SelectItem value="50">50 / página</SelectItem>
                    <SelectItem value="100">100 / página</SelectItem>
                    <SelectItem value="250">250 / página</SelectItem>
                  </SelectContent>
                </Select>
                <Button variant="outline" size="sm" onClick={exportCsv} className="h-9">
                  <Download className="mr-1.5 size-4" /> CSV
                </Button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <Th label="#" k="rank" sortKey={sortKey} sortAsc={sortAsc} toggle={toggleSort} />
                    <Th label="PLU" k="prod_code" sortKey={sortKey} sortAsc={sortAsc} toggle={toggleSort} />
                    <Th label="Descrição" k="prod_name" sortKey={sortKey} sortAsc={sortAsc} toggle={toggleSort} />
                    <th className="py-2">Hierarquia</th>
                    <Th label="Venda" k="val" sortKey={sortKey} sortAsc={sortAsc} toggle={toggleSort} align="right" />
                    <Th label="Ocorr." k="qty" sortKey={sortKey} sortAsc={sortAsc} toggle={toggleSort} align="right" />
                    <Th label="Part. %" k="share" sortKey={sortKey} sortAsc={sortAsc} toggle={toggleSort} align="right" />
                    <th className="py-2 text-right">Acum. %</th>
                    <Th label="ABC" k="abc" sortKey={sortKey} sortAsc={sortAsc} toggle={toggleSort} />
                    <Th label="Δ vs anterior" k="delta" sortKey={sortKey} sortAsc={sortAsc} toggle={toggleSort} align="right" />
                    <th className="py-2">Tendência</th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((p) => {
                    const lowRel = p.share < 0.001;
                    return (
                      <tr
                        key={p.prod_code}
                        onClick={() => openProduct(p.prod_code)}
                        className={`cursor-pointer border-b border-border/60 hover:bg-muted/40 ${lowRel ? "bg-amber-50/40" : ""}`}
                        title="Abrir Análise de Produto"
                      >
                        <td className="py-2 font-mono text-xs">{p.rank}</td>
                        <td className="py-2 font-mono text-xs">{p.prod_code}</td>
                        <td className="py-2 max-w-[260px] truncate">{p.prod_name}</td>
                        <td className="py-2 text-xs text-muted-foreground max-w-[200px] truncate">
                          {[p.depto, p.secao, p.grupo, p.subgrupo].filter(Boolean).join(" › ") || "—"}
                        </td>
                        <td className="num py-2 text-right">{fmtBRL(p.val)}</td>
                        <td className="num py-2 text-right">{fmtInt(p.qty)}</td>
                        <td className="num py-2 text-right">{pct(p.share)}</td>
                        <td className="num py-2 text-right text-muted-foreground">{pct(p.acc)}</td>
                        <td className="py-2">
                          <span
                            className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold text-white"
                            style={{ backgroundColor: ABC_COLORS[p.abc] }}
                          >{p.abc}</span>
                        </td>
                        <td className={`num py-2 text-right text-xs font-semibold ${p.prev_val === 0 ? "text-muted-foreground" : p.delta > 0 ? "text-green-700" : p.delta < 0 ? "text-red-700" : ""}`}>
                          {p.prev_val > 0 ? `${(p.delta * 100).toFixed(1)}%` : (p.val > 0 ? "novo" : "—")}
                        </td>
                        <td className="py-2 text-xs">
                          {p.prev_val === 0 && p.val === 0 ? <span className="inline-flex items-center gap-1 text-muted-foreground"><AlertCircle className="size-3" />sem venda</span>
                          : p.delta >= 0.1 ? <span className="inline-flex items-center gap-1 text-green-700"><TrendingUp className="size-3" />Crescimento</span>
                          : p.delta <= -0.1 ? <span className="inline-flex items-center gap-1 text-red-700"><TDown className="size-3" />Queda</span>
                          : <span className="inline-flex items-center gap-1 text-muted-foreground"><Minus className="size-3" />Estável</span>}
                        </td>
                      </tr>
                    );
                  })}
                  {pageRows.length === 0 && !isFetching && (
                    <tr><td colSpan={11} className="py-8 text-center text-sm text-muted-foreground">Nenhum produto encontrado.</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
              <div>
                Exibindo {totalRows === 0 ? 0 : (page - 1) * pageSize + 1}–{Math.min(page * pageSize, totalRows)} de {fmtInt(totalRows)} produtos
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                  <ChevronLeft className="size-4" />
                </Button>
                <span>Página {page} de {totalPages}</span>
                <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
                  <ChevronRight className="size-4" />
                </Button>
              </div>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Linhas destacadas em amarelo indicam produtos com participação muito baixa (&lt; 0,1%). Clique em uma linha para abrir a Análise de Produto.
            </p>
          </div>
        </>
      )}
    </div>
  );
}

function Th({ label, k, sortKey, sortAsc, toggle, align = "left" }: {
  label: string; k: SortKey; sortKey: SortKey; sortAsc: boolean;
  toggle: (k: SortKey) => void; align?: "left" | "right";
}) {
  const active = sortKey === k;
  return (
    <th className={`py-2 ${align === "right" ? "text-right" : ""}`}>
      <button
        onClick={() => toggle(k)}
        className={`inline-flex items-center gap-1 hover:text-foreground ${active ? "text-foreground" : ""}`}
      >
        {label}
        {active && (sortAsc ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />)}
      </button>
    </th>
  );
}
