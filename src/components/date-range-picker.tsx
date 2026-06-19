import { useMemo, useState } from "react";
import { Calendar as CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn, fmtBRShort } from "@/lib/utils";

function iso(d: Date) {
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}
function shift(date: Date, days: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}
function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}
function endOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

export type PresetKey =
  | "today" | "yesterday" | "last7" | "last30" | "month" | "prevMonth" | "custom";

interface Props {
  from: string;
  to: string;
  onChange: (range: { from: string; to: string }) => void;
  /** Reference date for "today" — defaults to actual today; pass latestDate for presets relative to last imported day. */
  reference?: string;
  /** Datas (ISO YYYY-MM-DD) que possuem dados disponíveis. Demais datas ficam desabilitadas. */
  availableDates?: string[];
}

const PRESETS: { key: PresetKey; label: string }[] = [
  { key: "today",     label: "Hoje" },
  { key: "yesterday", label: "Ontem" },
  { key: "last7",     label: "Últimos 7 dias" },
  { key: "last30",    label: "Últimos 30 dias" },
  { key: "month",     label: "Mês atual" },
  { key: "prevMonth", label: "Mês anterior" },
  { key: "custom",    label: "Personalizado" },
];

export function computePreset(key: PresetKey, refIso?: string): { from: string; to: string } | null {
  const ref = refIso ? new Date(refIso + "T00:00:00") : new Date();
  switch (key) {
    case "today":     return { from: iso(ref), to: iso(ref) };
    case "yesterday": { const y = shift(ref, -1); return { from: iso(y), to: iso(y) }; }
    case "last7":     return { from: iso(shift(ref, -6)),  to: iso(ref) };
    case "last30":    return { from: iso(shift(ref, -29)), to: iso(ref) };
    case "month":     return { from: iso(startOfMonth(ref)), to: iso(ref) };
    case "prevMonth": {
      const prev = new Date(ref.getFullYear(), ref.getMonth() - 1, 1);
      return { from: iso(startOfMonth(prev)), to: iso(endOfMonth(prev)) };
    }
    default: return null;
  }
}

export function DateRangePicker({ from, to, onChange, reference, availableDates }: Props) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<PresetKey>("custom");

  const availableSet = useMemo(() => new Set(availableDates ?? []), [availableDates]);
  const hasAvailable = availableSet.size > 0;
  const minIso = availableDates && availableDates.length ? availableDates[0] : undefined;
  const maxIso = availableDates && availableDates.length ? availableDates[availableDates.length - 1] : undefined;

  const clampRange = (r: { from: string; to: string }): { from: string; to: string } | null => {
    if (!hasAvailable) return r;
    const within = (availableDates ?? []).filter((d) => d >= r.from && d <= r.to);
    if (within.length === 0) return null;
    return { from: within[0], to: within[within.length - 1] };
  };

  const label = useMemo(() => {
    if (!from && !to) return "Selecione um período";
    if (from === to) return fmtBRShort(from);
    return `${fmtBRShort(from)} — ${fmtBRShort(to)}`;
  }, [from, to]);

  const apply = (key: PresetKey) => {
    const r = computePreset(key, reference);
    if (r) {
      const clamped = clampRange(r);
      if (clamped) {
        onChange(clamped);
        setOpen(false);
      }
    } else {
      setMode("custom");
    }
  };

  const isDisabled = (d: Date) => {
    if (!hasAvailable) return false;
    return !availableSet.has(iso(d));
  };

  const selectedRange = useMemo(
    () => ({
      from: from ? new Date(from + "T00:00:00") : undefined,
      to: to ? new Date(to + "T00:00:00") : undefined,
    }),
    [from, to],
  );

  const handleRangeSelect = (range: { from?: Date; to?: Date } | undefined) => {
    if (!range || !range.from) {
      return;
    }
    const f = iso(range.from);
    const t = range.to ? iso(range.to) : f;
    const clamped = clampRange({ from: f, to: t });
    if (clamped) {
      setMode("custom");
      onChange(clamped);
    }
  };

  const defaultMonth = from
    ? new Date(from + "T00:00:00")
    : reference
      ? new Date(reference + "T00:00:00")
      : maxIso
        ? new Date(maxIso + "T00:00:00")
        : new Date();

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className="h-9 w-full justify-start gap-2 text-left font-normal">
          <CalendarIcon className="size-4 opacity-60" />
          <span className="truncate whitespace-nowrap">{label}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <div className="grid grid-cols-2 gap-1 p-2">
          {PRESETS.map((p) => (
            <button
              key={p.key}
              onClick={() => { setMode(p.key); apply(p.key); }}
              className={cn(
                "rounded-md border px-2 py-1.5 text-xs font-medium transition text-left",
                mode === p.key
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border bg-background hover:border-primary/40"
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="border-t p-2 space-y-2">
          <div className="flex items-center justify-between gap-2 text-xs">
            <Label className="text-xs">Período selecionado</Label>
            <span className="text-muted-foreground whitespace-nowrap font-medium">
              {from ? fmtBRShort(from) : "—"} → {to ? fmtBRShort(to) : "—"}
            </span>
          </div>
          <Calendar
            mode="range"
            selected={selectedRange}
            onSelect={handleRangeSelect}
            defaultMonth={defaultMonth}
            disabled={isDisabled}
            startMonth={minIso ? new Date(minIso + "T00:00:00") : undefined}
            endMonth={maxIso ? new Date(maxIso + "T00:00:00") : undefined}
            numberOfMonths={1}
            className={cn("p-2 pointer-events-auto")}
          />
          <div className="flex flex-wrap items-center gap-2 px-1 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <span className="inline-block size-2.5 rounded-sm bg-primary" />
              Período selecionado
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block size-2.5 rounded-sm border border-dashed border-border bg-background" />
              Indisponível
            </span>
          </div>
          {!hasAvailable && (
            <p className="text-xs text-muted-foreground px-1">
              Nenhuma data com dados disponíveis para os filtros atuais.
            </p>
          )}
          <Button size="sm" className="w-full" onClick={() => setOpen(false)}>Aplicar</Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
