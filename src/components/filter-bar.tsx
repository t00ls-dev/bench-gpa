import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getFilterOptions } from "@/lib/dashboard.functions";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { DateRangePicker } from "@/components/date-range-picker";
import { MultiSelect } from "@/components/multi-select";
import { defaultDateWindow } from "@/lib/date-window";

export interface Filters {
  dateFrom: string;
  dateTo: string;
  stores: string[];
  deptos: string[];
  secoes: string[];
  grupos: string[];
  subgrupos: string[];
  compare: "prev_period" | "prev_week" | "prev_month" | "none";
}

interface Props {
  value: Filters;
  onChange: (f: Filters) => void;
}

interface StoreOpt {
  store_code: string;
  store_name: string;
}

export function FilterBar({ value, onChange }: Props) {
  const getOpts = useServerFn(getFilterOptions);
  // Cascading filters: each level narrows the next
  const { data: opts } = useQuery({
    queryKey: [
      "filter-options",
      value.dateFrom,
      value.dateTo,
      value.stores,
      value.deptos,
      value.secoes,
      value.grupos,
    ],
    queryFn: () =>
      getOpts({
        data: {
          dateFrom: value.dateFrom || null,
          dateTo: value.dateTo || null,
          stores: value.stores,
          deptos: value.deptos,
          secoes: value.secoes,
          grupos: value.grupos,
        },
      }),
    staleTime: 10 * 60_000,
    gcTime: 30 * 60_000,
  });

  // Seed default date range to the last 7 available dates, not the full
  // history. Aggregating the entire detail table (~3M rows once all dates are
  // imported) on every dashboard load took ~20s; the last-7 window keeps it
  // under 1s. The picker still allows selecting any range. Matches the default
  // window already used by area.page.
  useEffect(() => {
    const avail = opts?.availableDates ?? [];
    if (avail.length > 0 && !value.dateFrom && !value.dateTo) {
      const win = defaultDateWindow(avail);
      if (win) onChange({ ...value, dateFrom: win.from, dateTo: win.to });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts?.availableDates]);

  // Re-clamp current selection to available dates if filters narrowed the data set
  useEffect(() => {
    const avail = opts?.availableDates ?? [];
    if (!avail.length || !value.dateFrom || !value.dateTo) return;
    const within = avail.filter((d: string) => d >= value.dateFrom && d <= value.dateTo);
    if (within.length === 0) {
      const latest = opts!.latestDate!;
      onChange({ ...value, dateFrom: latest, dateTo: latest });
    } else if (within[0] !== value.dateFrom || within[within.length - 1] !== value.dateTo) {
      onChange({ ...value, dateFrom: within[0], dateTo: within[within.length - 1] });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts?.availableDates]);

  const setF = (patch: Partial<Filters>) => onChange({ ...value, ...patch });
  const stores: StoreOpt[] = (opts?.stores ?? []) as StoreOpt[];
  const strList = (arr: unknown): string[] => (arr ?? []) as string[];

  // Cascading reset: when a parent changes, drop dependent selections.
  const setStores = (v: string[]) =>
    setF({ stores: v, deptos: [], secoes: [], grupos: [], subgrupos: [] });
  const setDeptos = (v: string[]) => setF({ deptos: v, secoes: [], grupos: [], subgrupos: [] });
  const setSecoes = (v: string[]) => setF({ secoes: v, grupos: [], subgrupos: [] });
  const setGrupos = (v: string[]) => setF({ grupos: v, subgrupos: [] });

  return (
    <div className="kpi-card mb-6">
      <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
        <div className="lg:col-span-2">
          <Label className="text-xs">Período</Label>
          <div className="mt-1">
            <DateRangePicker
              from={value.dateFrom}
              to={value.dateTo}
              reference={opts?.latestDate ?? undefined}
              availableDates={opts?.availableDates ?? []}
              onChange={(r) => setF({ dateFrom: r.from, dateTo: r.to })}
            />
          </div>
        </div>
        <div>
          <Label className="text-xs">Loja</Label>
          <MultiSelect
            label="Todas"
            noun={{ one: "loja", other: "lojas" }}
            options={stores.map((s) => ({
              value: s.store_code,
              label: `${s.store_code} - ${s.store_name}`,
            }))}
            value={value.stores}
            onChange={setStores}
          />
        </div>
        <div>
          <Label className="text-xs">Departamento</Label>
          <MultiSelect
            label="Todos"
            noun={{ one: "departamento", other: "departamentos" }}
            options={strList(opts?.deptos).map((s) => ({ value: s, label: s }))}
            value={value.deptos}
            onChange={setDeptos}
          />
        </div>
        <div>
          <Label className="text-xs">Seção</Label>
          <MultiSelect
            label="Todas"
            noun={{ one: "seção", other: "seções" }}
            options={strList(opts?.secoes).map((s) => ({ value: s, label: s }))}
            value={value.secoes}
            onChange={setSecoes}
          />
        </div>
        <div>
          <Label className="text-xs">Grupo</Label>
          <MultiSelect
            label="Todos"
            noun={{ one: "grupo", other: "grupos" }}
            options={strList(opts?.grupos).map((s) => ({ value: s, label: s }))}
            value={value.grupos}
            onChange={setGrupos}
          />
        </div>
        <div>
          <Label className="text-xs">Subgrupo</Label>
          <MultiSelect
            label="Todos"
            noun={{ one: "subgrupo", other: "subgrupos" }}
            options={strList(opts?.subgrupos).map((s) => ({ value: s, label: s }))}
            value={value.subgrupos}
            onChange={(v) => setF({ subgrupos: v })}
          />
        </div>
      </div>
      <div className="mt-3">
        <Label className="text-xs">Comparar com</Label>
        <div className="mt-1 flex flex-wrap gap-1.5" role="radiogroup" aria-label="Comparar com">
          {[
            { v: "prev_period", l: "Período anterior" },
            { v: "prev_week", l: "Semana anterior" },
            { v: "prev_month", l: "Mês anterior" },
            { v: "none", l: "Sem comparação" },
          ].map((o) => (
            <button
              key={o.v}
              role="radio"
              aria-checked={value.compare === o.v}
              onClick={() => setF({ compare: o.v as Filters["compare"] })}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium transition",
                value.compare === o.v
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background text-muted-foreground hover:border-primary/50",
              )}
            >
              {o.l}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
