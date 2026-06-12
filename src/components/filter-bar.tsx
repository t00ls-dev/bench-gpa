import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getFilterOptions } from "@/lib/analytics.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Check, ChevronDown, X } from "lucide-react";
import { cn } from "@/lib/utils";

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
        <div className="max-h-72 overflow-y-auto">
          {options.length === 0 && <div className="p-3 text-xs text-muted-foreground">Nenhuma opção.</div>}
          {options.map((o) => (
            <button
              key={o.value}
              onClick={() => toggle(o.value)}
              className="flex w-full items-center justify-between px-3 py-2 text-sm hover:bg-muted"
            >
              <span className="truncate">{o.label}</span>
              {value.includes(o.value) && <Check className="size-4 text-primary" />}
            </button>
          ))}
        </div>
        {value.length > 0 && (
          <div className="border-t p-2">
            <Button variant="ghost" size="sm" className="w-full" onClick={() => onChange([])}>
              <X className="mr-1 size-3" /> Limpar
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

export function FilterBar({ value, onChange }: Props) {
  const getOpts = useServerFn(getFilterOptions);
  // Filter options scoped to the selected date window (so all hierarchies present in those days are shown)
  const { data: opts } = useQuery({
    queryKey: ["filter-options", value.dateFrom, value.dateTo],
    queryFn: () => getOpts({ data: { dateFrom: value.dateFrom || null, dateTo: value.dateTo || null } }),
  });

  // Seed default date range from latest date once
  useEffect(() => {
    if (opts?.latestDate && !value.dateFrom && !value.dateTo) {
      onChange({ ...value, dateFrom: opts.latestDate, dateTo: opts.latestDate });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts?.latestDate]);

  const setF = (patch: Partial<Filters>) => onChange({ ...value, ...patch });
  const stores: StoreOpt[] = (opts?.stores ?? []) as StoreOpt[];
  const strList = (arr: unknown): string[] => (arr ?? []) as string[];

  return (
    <div className="kpi-card mb-6 grid gap-3 md:grid-cols-3 lg:grid-cols-6">
      <div>
        <Label className="text-xs">De</Label>
        <Input type="date" value={value.dateFrom} onChange={(e) => setF({ dateFrom: e.target.value })} className="mt-1 h-9" />
      </div>
      <div>
        <Label className="text-xs">Até</Label>
        <Input type="date" value={value.dateTo} onChange={(e) => setF({ dateTo: e.target.value })} className="mt-1 h-9" />
      </div>
      <div>
        <Label className="text-xs">Loja</Label>
        <MultiSelect
          label="Todas"
          options={stores.map((s) => ({ value: s.store_code, label: `${s.store_code} — ${s.store_name}` }))}
          value={value.stores}
          onChange={(v) => setF({ stores: v })}
        />
      </div>
      <div>
        <Label className="text-xs">Departamento</Label>
        <MultiSelect label="Todos" options={strList(opts?.deptos).map((s) => ({ value: s, label: s }))} value={value.deptos} onChange={(v) => setF({ deptos: v })} />
      </div>
      <div>
        <Label className="text-xs">Seção</Label>
        <MultiSelect label="Todas" options={strList(opts?.secoes).map((s) => ({ value: s, label: s }))} value={value.secoes} onChange={(v) => setF({ secoes: v })} />
      </div>
      <div>
        <Label className="text-xs">Grupo</Label>
        <MultiSelect label="Todos" options={strList(opts?.grupos).map((s) => ({ value: s, label: s }))} value={value.grupos} onChange={(v) => setF({ grupos: v })} />
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
  );
}
