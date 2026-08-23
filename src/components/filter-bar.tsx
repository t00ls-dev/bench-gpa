import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getFilterOptions } from "@/lib/dashboard.functions";
import { DateRangePicker } from "@/components/date-range-picker";
import { MultiSelect } from "@/components/multi-select";
import { FilterField } from "@/components/filter-field";
import { defaultDateWindow } from "@/lib/date-window";
import { QUERY_STALE_REFERENCE, QUERY_GC_REFERENCE } from "@/lib/query-config";
import { cascadePatch } from "@/lib/filter-cascade";

export interface Filters {
  dateFrom: string;
  dateTo: string;
  stores: string[];
  deptos: string[];
  secoes: string[];
  grupos: string[];
  subgrupos: string[];
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
    staleTime: QUERY_STALE_REFERENCE,
    gcTime: QUERY_GC_REFERENCE,
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
  const setStores = (v: string[]) => setF(cascadePatch("stores", v));
  const setDeptos = (v: string[]) => setF(cascadePatch("deptos", v));
  const setSecoes = (v: string[]) => setF(cascadePatch("secoes", v));
  const setGrupos = (v: string[]) => setF(cascadePatch("grupos", v));

  return (
    <div className="kpi-card mb-6 min-w-0 overflow-hidden">
      <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 [&>*]:min-w-0">
        <FilterField label="Período" className="lg:col-span-2">
          <div className="mt-1">
            <DateRangePicker
              from={value.dateFrom}
              to={value.dateTo}
              reference={opts?.latestDate ?? undefined}
              availableDates={opts?.availableDates ?? []}
              onChange={(r) => setF({ dateFrom: r.from, dateTo: r.to })}
            />
          </div>
        </FilterField>
        <FilterField label="Loja">
          <MultiSelect
            label="Todas"
            options={stores.map((s) => ({
              value: s.store_code,
              label: `${s.store_code} - ${s.store_name}`,
            }))}
            value={value.stores}
            onChange={setStores}
          />
        </FilterField>
        <FilterField label="Departamento">
          <MultiSelect
            label="Todos"
            options={strList(opts?.deptos).map((s) => ({ value: s, label: s }))}
            value={value.deptos}
            onChange={setDeptos}
          />
        </FilterField>
        <FilterField label="Seção">
          <MultiSelect
            label="Todas"
            options={strList(opts?.secoes).map((s) => ({ value: s, label: s }))}
            value={value.secoes}
            onChange={setSecoes}
          />
        </FilterField>
        <FilterField label="Grupo">
          <MultiSelect
            label="Todos"
            options={strList(opts?.grupos).map((s) => ({ value: s, label: s }))}
            value={value.grupos}
            onChange={setGrupos}
          />
        </FilterField>
        <FilterField label="Subgrupo">
          <MultiSelect
            label="Todos"
            options={strList(opts?.subgrupos).map((s) => ({ value: s, label: s }))}
            value={value.subgrupos}
            onChange={(v) => setF({ subgrupos: v })}
          />
        </FilterField>
      </div>
    </div>
  );
}
