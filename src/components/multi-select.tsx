import { useMemo, useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Check, ChevronDown, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

function truncate(s: string, max = 20) {
  return s.length > max ? s.slice(0, max) + "…" : s;
}

export interface MSOption { value: string; label: string }

export function MultiSelect({
  label, options, value, onChange, searchable = false, single = false,
}: {
  label: string;
  options: MSOption[];
  value: string[];
  onChange: (v: string[]) => void;
  searchable?: boolean;
  /** When true, behaves as a single-select: replaces selection and closes on pick. */
  single?: boolean;
}) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [triggerWidth, setTriggerWidth] = useState(0);

  useEffect(() => {
    const el = triggerRef.current;
    if (!el) return;
    setTriggerWidth(el.offsetWidth);
    const ro = new ResizeObserver(() => {
      if (triggerRef.current) setTriggerWidth(triggerRef.current.offsetWidth);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const filtered = useMemo(() => {
    if (!searchable || !q.trim()) return options;
    const t = q.toLowerCase();
    return options.filter((o) => o.label.toLowerCase().includes(t) || o.value.toLowerCase().includes(t));
  }, [options, q, searchable]);
  const allSelected = !single && options.length > 0 && value.length === options.length;

  const handleToggle = (v: string) => {
    if (single) {
      // Single-select: replace and close
      if (value.length === 1 && value[0] === v) {
        onChange([]);
      } else {
        onChange([v]);
      }
      setOpen(false);
      return;
    }
    // Multi-select: keep popover open, toggle item using latest value
    onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);
  };

  const toggleAll = () => onChange(allSelected ? [] : options.map((o) => o.value));

  return (
    <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            ref={triggerRef}
            type="button" variant="outline" aria-label={label} className="h-9 w-full max-w-full justify-between text-left font-normal">
          <span className="truncate min-w-0">
            {value.length === 0
              ? label
              : truncate(options.find((o) => o.value === value[0])?.label ?? value[0])}
            {value.length > 1 && (
              <span className="ml-1.5 rounded-full bg-primary/10 px-1.5 py-0.5 text-xs text-primary">
                +{value.length - 1}
              </span>
            )}
          </span>
          <ChevronDown className="ml-2 size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        style={{ width: triggerWidth || undefined }}
        className="max-w-[calc(100vw-2rem)] p-0"
        align="start"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        {searchable && (
          <div className="flex items-center gap-2 border-b px-2 py-1.5">
            <Search className="size-3.5 text-muted-foreground" />
            <Input
              autoFocus
              placeholder="Buscar…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="h-7 border-0 px-0 text-sm shadow-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>
        )}
        {!single && options.length > 0 && (
          <button
            type="button"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleAll(); }}
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
        <div className="max-h-72 overflow-y-auto" role="listbox" aria-label={label}>
          {filtered.length === 0 && (
            <div className="p-3 text-xs text-muted-foreground">Nenhuma opção.</div>
          )}
          {filtered.map((o) => {
            const checked = value.includes(o.value);
            return (
              <button
                key={o.value}
                type="button"
                role="option"
                aria-selected={checked}
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleToggle(o.value); }}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-muted"
              >
                <span className={cn(
                  "flex size-4 shrink-0 items-center justify-center border",
                  single ? "rounded-full" : "rounded",
                  checked ? "bg-primary border-primary text-primary-foreground" : "border-input bg-background"
                )}>
                  {checked && <Check className="size-3" />}
                </span>
                <span className="truncate text-left flex-1">{o.label}</span>
              </button>
            );
          })}
        </div>
        {!single && value.length > 0 && (
          <div className="border-t p-2">
            <Button type="button" variant="ghost" size="sm" className="w-full" onClick={() => onChange([])}>
              <X className="mr-1 size-3" /> Limpar seleção
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
