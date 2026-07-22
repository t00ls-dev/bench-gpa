function truncate(s: string, max = 20) {
  return s.length > max ? s.slice(0, max) + "…" : s;
}

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
type PresetKey = "yesterday" | "last7" | "last14" | "last28" | "custom";

interface Props {
  from: string;
  to: string;
  onChange: (range: { from: string; to: string }) => void;
  /** Reference date for relative presets (last7/last30/month). Defaults to actual today.
   *  "Ontem" sempre usa o dia anterior ao dia atual real, ignorando esta referência. */
  reference?: string;
  /** Datas (ISO YYYY-MM-DD) que possuem dados disponíveis. Demais datas ficam desabilitadas. */
  availableDates?: string[];
}

const PRESETS: { key: PresetKey; label: string }[] = [
  { key: "yesterday", label: "Ontem" },
  { key: "last7", label: "Últimos 7 dias" },
  { key: "last14", label: "Últimas 2 semanas" },
  { key: "last28", label: "Últimos 28 dias" },
  { key: "custom", label: "Personalizado" },
];

function computePreset(key: PresetKey, refIso?: string): { from: string; to: string } | null {
  const ref = refIso ? new Date(refIso + "T00:00:00") : new Date();
  switch (key) {
    case "yesterday": {
      const y = shift(new Date(), -1);
      return { from: iso(y), to: iso(y) };
    }
    case "last7":
      return { from: iso(shift(ref, -6)), to: iso(ref) };
    case "last14":
      return { from: iso(shift(ref, -13)), to: iso(ref) };
    case "last28":
      return { from: iso(shift(ref, -27)), to: iso(ref) };
    default:
      return null;
  }
}

export function DateRangePicker({ from, to, onChange, reference, availableDates }: Props) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<PresetKey>("custom");

  const availableSet = useMemo(() => new Set(availableDates ?? []), [availableDates]);
  const hasAvailable = availableSet.size > 0;
  const minIso = availableDates && availableDates.length ? availableDates[0] : undefined;
  const maxIso =
    availableDates && availableDates.length ? availableDates[availableDates.length - 1] : undefined;

  const clampRange = (r: { from: string; to: string }): { from: string; to: string } | null => {
    // Never let an inverted range (from > to) reach state or the Calendar —
    // it makes "no data found" downstream and crashes the range picker.
    const ordered = r.from <= r.to ? r : { from: r.to, to: r.from };
    if (!hasAvailable) return ordered;
    const within = (availableDates ?? []).filter((d) => d >= ordered.from && d <= ordered.to);
    if (within.length === 0) return null;
    return { from: within[0], to: within[within.length - 1] };
  };

  const label = useMemo(() => {
    if (!from && !to) return "Selecione um período";
    if (from === to) return fmtBRShort(from);
    return `${fmtBRShort(from)} - ${fmtBRShort(to)}`;
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

  // Defensive: never pass an inverted range to <Calendar> — it expects
  // from <= to and breaks otherwise, regardless of what upstream state sends.
  const selectedRange = useMemo(() => {
    const [orderedFrom, orderedTo] = from && to && from > to ? [to, from] : [from, to];
    return {
      from: orderedFrom ? new Date(orderedFrom + "T00:00:00") : undefined,
      to: orderedTo ? new Date(orderedTo + "T00:00:00") : undefined,
    };
  }, [from, to]);

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
        <Button
          variant="outline"
          className="h-9 w-full max-w-full justify-start gap-2 text-left font-normal"
        >
          <CalendarIcon className="size-4 opacity-60" />
          <span className="truncate whitespace-nowrap min-w-0">{truncate(label)}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start" collisionPadding={24}>
        <div className="grid grid-cols-2 gap-1 p-2" role="radiogroup" aria-label="Período">
          {PRESETS.map((p) => (
            <button
              key={p.key}
              role="radio"
              aria-checked={mode === p.key}
              onClick={() => {
                setMode(p.key);
                apply(p.key);
              }}
              className={cn(
                "rounded-md border px-2 py-1.5 text-xs font-medium transition text-left",
                mode === p.key
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border bg-background hover:border-primary/40",
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
              {from ? fmtBRShort(from) : "(sem)"} - {to ? fmtBRShort(to) : "(sem)"}
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
            {hasAvailable && (
              <span className="ml-auto font-medium">
                {availableDates!.length} datas disponíveis
              </span>
            )}
          </div>
          {!hasAvailable && (
            <p className="text-xs text-muted-foreground px-1">
              Nenhuma data com dados disponíveis para os filtros atuais.
            </p>
          )}
          <Button size="sm" className="w-full" onClick={() => setOpen(false)}>
            Aplicar
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
