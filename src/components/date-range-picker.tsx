import { useMemo, useState } from "react";
import { Calendar as CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

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
function fmtBR(s: string) {
  if (!s) return "—";
  const [y, m, d] = s.split("-");
  return `${d}/${m}/${y}`;
}

export type PresetKey =
  | "today" | "yesterday" | "last7" | "last30" | "month" | "prevMonth" | "custom";

interface Props {
  from: string;
  to: string;
  onChange: (range: { from: string; to: string }) => void;
  /** Reference date for "today" — defaults to actual today; pass latestDate for presets relative to last imported day. */
  reference?: string;
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

export function DateRangePicker({ from, to, onChange, reference }: Props) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<PresetKey>("custom");

  const label = useMemo(() => {
    if (!from && !to) return "Selecione um período";
    if (from === to) return fmtBR(from);
    return `${fmtBR(from)} — ${fmtBR(to)}`;
  }, [from, to]);

  const apply = (key: PresetKey) => {
    const r = computePreset(key, reference);
    if (r) {
      onChange(r);
      setOpen(false);
    } else {
      setMode("custom");
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className="h-9 w-full justify-start gap-2 text-left font-normal">
          <CalendarIcon className="size-4 opacity-60" />
          <span className="truncate">{label}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[320px] p-0" align="start">
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
        <div className="border-t p-3 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">De</Label>
              <Input
                type="date"
                value={from}
                onChange={(e) => onChange({ from: e.target.value, to })}
                className="mt-1 h-8"
              />
            </div>
            <div>
              <Label className="text-xs">Até</Label>
              <Input
                type="date"
                value={to}
                onChange={(e) => onChange({ from, to: e.target.value })}
                className="mt-1 h-8"
              />
            </div>
          </div>
          <Button size="sm" className="w-full" onClick={() => setOpen(false)}>Aplicar</Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
