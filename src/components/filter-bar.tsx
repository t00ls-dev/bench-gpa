import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getFilterOptions } from "@/lib/analytics.functions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Check, ChevronDown, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { DateRangePicker } from "@/components/date-range-picker";

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

interface StoreOpt { store_code: string; store_name: string }

function MultiSelect({
  label, options, value, onChange,
}: { label: string; options: { value: string; label: string }[]; value: string[]; onChange: (v: string[]) => void }) {
  const toggle = (v: string) => onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);
  const allSelected = options.length > 0 && value.length === options.length;
  const toggleAll = () => onChange(allSelected ? [] : options.map((o) => o.value));
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" className="h-9 w-full justify-between text-left font-normal">
          <span className="truncate">
            {label}{value.length > 0 && <span className="ml-1.5 rounded-full bg-primary/10 px-1.5 py-0.5 text-xs text-primary">{value.length}</span>}
          </span>
          <ChevronDown className="ml-2 size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0">
        {options.length > 0 && (
          <button
            onClick={toggleAll}
            className="flex w-full items-center gap-2 border-b px-3 py-2 text-sm font-medium hover:bg-muted"
          >
            <span className={cn(
              "flex size-4 items-center justify-center rounded border",
              allSelected ? "bg-primary border-primary text-primary-foreground" : "border-input bg-background"
            )}>
              {allSelected && <Check className="size-3" />}
            </span>
            <span>Selecionar todos</span>
          </button>
        )}
        <div className="max-h-72 overflow-y-auto">
          {options.length === 0 && <div className="p-3 text-xs text-muted-foreground">Nenhuma opção.</div>}
          {options.map((o) => {
            const checked = value.includes(o.value);
            return (
              <button
                key={o.value}
                onClick={() => toggle(o.value)}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-muted"
              >
                <span className={cn(
                  "flex size-4 shrink-0 items-center justify-center rounded border",
                  checked ? "bg-primary border-primary text-primary-foreground" : "border-input bg-background"
                )}>
                  {checked && <Check className="size-3" />}
                </span>
                <span className="truncate text-left flex-1">{o.label}</span>
              </button>
            );
          })}
        </div>
        {value.length > 0 && (
          <div className="border-t p-2">
            <Button variant="ghost" size="sm" className="w-full" onClick={() => onChange([])}>
              <X className="mr-1 size-3" /> Limpar seleção
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

export function FilterBar({ value, onChange }: Props) {
  const getOpts = useServerFn(getFilterOptions);
  // Cascading filters: each level narrows the next
  const { data: opts } = useQuery({
    queryKey: ["filter-options", value.dateFrom, value.dateTo, value.stores, value.deptos, value.secoes, value.grupos],
    queryFn: () => getOpts({ data: {
      dateFrom: value.dateFrom || null,
      dateTo: value.dateTo || null,
      stores: value.stores, deptos: value.deptos, secoes: value.secoes, grupos: value.grupos,
    } }),
    staleTime: 5 * 60_000,
    gcTime: 10 * 60_000,
  });

  // Seed default date range from latest available date once
  useEffect(() => {
    if (opts?.latestDate && !value.dateFrom && !value.dateTo) {
      onChange({ ...value, dateFrom: opts.latestDate, dateTo: opts.latestDate });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts?.latestDate]);

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
  const setStores = (v: string[]) => setF({ stores: v, deptos: [], secoes: [], grupos: [], subgrupos: [] });
  const setDeptos = (v: string[]) => setF({ deptos: v, secoes: [], grupos: [], subgrupos: [] });
  const setSecoes = (v: string[]) => setF({ secoes: v, grupos: [], subgrupos: [] });
  const setGrupos = (v: string[]) => setF({ grupos: v, subgrupos: [] });

  void stores;


  return (
    <div className="kpi-card mb-6 space-y-3">
      <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-6">
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
            options={stores.map((s) => ({ value: s.store_code, label: `${s.store_code} - ${s.store_name}` }))}
            value={value.stores}
            onChange={setStores}
          />
        </div>
        <div>
          <Label className="text-xs">Departamento</Label>
          <MultiSelect label="Todos" options={strList(opts?.deptos).map((s) => ({ value: s, label: s }))} value={value.deptos} onChange={setDeptos} />
        </div>
        <div>
          <Label className="text-xs">Seção</Label>
          <MultiSelect label="Todas" options={strList(opts?.secoes).map((s) => ({ value: s, label: s }))} value={value.secoes} onChange={setSecoes} />
        </div>
        <div>
          <Label className="text-xs">Grupo</Label>
          <MultiSelect label="Todos" options={strList(opts?.grupos).map((s) => ({ value: s, label: s }))} value={value.grupos} onChange={setGrupos} />
        </div>
        <div className="md:col-span-2">
          <Label className="text-xs">Subgrupo</Label>
          <MultiSelect label="Todos" options={strList(opts?.subgrupos).map((s) => ({ value: s, label: s }))} value={value.subgrupos} onChange={(v) => setF({ subgrupos: v })} />
        </div>
        <div className="md:col-span-2 lg:col-span-4">
          <Label className="text-xs">Comparar com</Label>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {[
              { v: "prev_period", l: "Período anterior" },
              { v: "prev_week", l: "Semana anterior" },
              { v: "prev_month", l: "Mês anterior" },
              { v: "none", l: "Sem comparação" },
            ].map((o) => (
              <button
                key={o.v}
                onClick={() => setF({ compare: o.v as Filters["compare"] })}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs font-medium transition",
                  value.compare === o.v ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-muted-foreground hover:border-primary/50"
                )}
              >
                {o.l}
              </button>
            ))}
          </div>
        </div>
      </div>

    </div>
  );
}

function Chip(_: { label: string; onClear: () => void }) {
  return null;
}
