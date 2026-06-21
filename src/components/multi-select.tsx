import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Check, ChevronDown, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface MSOption { value: string; label: string }

export function MultiSelect({
  label, options, value, onChange, searchable = false,
}: {
  label: string;
  options: MSOption[];
  value: string[];
  onChange: (v: string[]) => void;
  searchable?: boolean;
}) {
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    if (!searchable || !q.trim()) return options;
    const t = q.toLowerCase();
    return options.filter((o) => o.label.toLowerCase().includes(t) || o.value.toLowerCase().includes(t));
  }, [options, q, searchable]);
  const allSelected = options.length > 0 && value.length === options.length;
  const toggle = (v: string) =>
    onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);
  const toggleAll = () => onChange(allSelected ? [] : options.map((o) => o.value));

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" className="h-9 w-full justify-between text-left font-normal">
          <span className="truncate">
            {label}
            {value.length > 0 && (
              <span className="ml-1.5 rounded-full bg-primary/10 px-1.5 py-0.5 text-xs text-primary">
                {value.length}
              </span>
            )}
          </span>
          <ChevronDown className="ml-2 size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0">
        {searchable && (
          <div className="flex items-center gap-2 border-b px-2 py-1.5">
            <Search className="size-3.5 text-muted-foreground" />
            <Input
              autoFocus
              placeholder="Buscar…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="h-7 border-0 px-0 text-sm shadow-none focus-visible:ring-0"
            />
          </div>
        )}
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
          {filtered.length === 0 && (
            <div className="p-3 text-xs text-muted-foreground">Nenhuma opção.</div>
          )}
          {filtered.map((o) => {
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
