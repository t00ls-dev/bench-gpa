import { useMemo, useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Check, ChevronDown, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

function truncate(s: string, max = 20) {
  return s.length > max ? s.slice(0, max) + "…" : s;
}

export interface MSOption {
  value: string;
  label: string;
}

export function MultiSelect({
  label,
  options,
  value,
  onChange,
  searchable = false,
  single = false,
}: {
  label: string;
  options: MSOption[];
  value: string[];
  onChange: (v: string[]) => void;
  searchable?: boolean;
  single?: boolean;
}) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [triggerWidth, setTriggerWidth] = useState(0);
  const [focusedIdx, setFocusedIdx] = useState(-1);

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
    return options.filter(
      (o) => o.label.toLowerCase().includes(t) || o.value.toLowerCase().includes(t),
    );
  }, [options, q, searchable]);
  const allSelected = !single && options.length > 0 && value.length === options.length;

  useEffect(() => {
    if (!open) { setFocusedIdx(-1); return; }
    if (searchable && searchInputRef.current) {
      searchInputRef.current.focus();
    }
    if (!searchable) setFocusedIdx(0);
  }, [open, searchable, options]);

  const handleToggle = useCallback((v: string) => {
    if (single) {
      onChange(value.length === 1 && value[0] === v ? [] : [v]);
      setOpen(false);
      return;
    }
    onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);
  }, [value, onChange, single]);

  const visibleOptions = useMemo(() => {
    const items = searchable && q.trim() ? filtered : options;
    if (single) return items;
    return [{ value: "__all__", label: "Selecionar todos" } as MSOption, ...items];
  }, [options, filtered, searchable, q, single]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!open) return;
    const len = visibleOptions.length;
    if (len === 0) return;

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setFocusedIdx((i) => (i + 1) % len);
        break;
      case "ArrowUp":
        e.preventDefault();
        setFocusedIdx((i) => (i - 1 + len) % len);
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        if (focusedIdx >= 0 && focusedIdx < len) {
          const target = visibleOptions[focusedIdx];
          if (target.value === "__all__") {
            const allVals = options.map((o) => o.value);
            onChange(allSelected ? [] : allVals);
          } else {
            handleToggle(target.value);
          }
        }
        break;
      case "Escape":
        setOpen(false);
        triggerRef.current?.focus();
        break;
    }
  }, [open, visibleOptions, focusedIdx, options, allSelected, onChange, handleToggle, setOpen]);

  useEffect(() => {
    if (focusedIdx < 0 || !listRef.current) return;
    const el = listRef.current.children[focusedIdx] as HTMLElement | undefined;
    el?.scrollIntoView({ block: "nearest" });
  }, [focusedIdx]);

  const renderOption = (o: MSOption, idx: number) => {
    if (o.value === "__all__") {
      return (
        <button
          key="__all__"
          type="button"
          role="option"
          aria-selected={allSelected}
          aria-label={allSelected ? "Desmarcar todos" : "Selecionar todos"}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            const allVals = options.map((x) => x.value);
            onChange(allSelected ? [] : allVals);
          }}
          className={cn(
            "flex w-full items-center gap-2 border-b px-3 py-2 text-sm font-medium",
            focusedIdx === idx ? "bg-muted" : "hover:bg-muted",
          )}
        >
          {renderCheckbox(allSelected)}
          <span>Selecionar todos</span>
        </button>
      );
    }

    const checked = value.includes(o.value);
    return (
      <button
        key={o.value}
        type="button"
        role="option"
        aria-selected={checked}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          handleToggle(o.value);
        }}
        className={cn(
          "flex w-full items-center gap-2 px-3 py-2 text-sm",
          focusedIdx === idx ? "bg-muted" : "hover:bg-muted",
        )}
      >
        {renderCheckbox(checked, single)}
        <span className="truncate text-left flex-1">{o.label}</span>
      </button>
    );
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          ref={triggerRef}
          type="button"
          variant="outline"
          aria-label={label}
          aria-haspopup="listbox"
          aria-expanded={open}
          className="h-9 w-full max-w-full justify-between text-left font-normal"
        >
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
        className="max-w-[calc(100vw-2rem)] p-0 flex flex-col overflow-y-auto"
        align="start"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        {searchable && (
          <div className="flex items-center gap-2 border-b px-2 py-1.5 shrink-0">
            <Search className="size-3.5 text-muted-foreground" />
            <Input
              ref={searchInputRef}
              autoFocus
              placeholder="Buscar…"
              aria-label="Buscar opções"
              value={q}
              onChange={(e) => { setQ(e.target.value); setFocusedIdx(0); }}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                  e.preventDefault();
                  setFocusedIdx((i) => {
                    const len = visibleOptions.length;
                    if (len === 0) return -1;
                    if (e.key === "ArrowDown") return (i + 1) % len;
                    return (i - 1 + len) % len;
                  });
                }
                if (e.key === "Enter" && focusedIdx >= 0) {
                  e.preventDefault();
                  const target = visibleOptions[focusedIdx];
                  if (target.value === "__all__") {
                    onChange(allSelected ? [] : options.map((o) => o.value));
                  } else {
                    handleToggle(target.value);
                  }
                }
              }}
              className="h-7 border-0 px-0 text-sm shadow-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>
        )}
        <div
          ref={listRef}
          className="max-h-72 overflow-y-auto outline-none"
          role="listbox"
          aria-label={label}
          tabIndex={-1}
          onKeyDown={handleKeyDown}
        >
          {visibleOptions.length === 0 && (
            <div className="p-3 text-xs text-muted-foreground">Nenhuma opção.</div>
          )}
          {visibleOptions.map((o, i) => renderOption(o, i))}
        </div>
        {!single && value.length > 0 && (
          <div className="border-t p-2 shrink-0">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="w-full"
              onClick={() => onChange([])}
            >
              <X className="mr-1 size-3" /> Limpar seleção
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

function renderCheckbox(checked: boolean, single?: boolean) {
  return (
    <span
      className={cn(
        "flex size-4 shrink-0 items-center justify-center border",
        single ? "rounded-full" : "rounded",
        checked
          ? "bg-primary border-primary text-primary-foreground"
          : "border-input bg-background",
      )}
    >
      {checked && <Check className="size-3" />}
    </span>
  );
}
