import { useDeferredValue, useMemo, useState } from "react";
import { Check, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { hasTextSelectionWithin } from "@/lib/dom-selection";

export interface SavedAreaProductOption {
  value: string;
  label: string;
}

const RESULT_LIMIT = 100;

export function SavedAreaProductPicker({
  options,
  value,
  onChange,
  loading,
  disabled,
}: {
  options: SavedAreaProductOption[];
  value: string[];
  onChange: (value: string[]) => void;
  loading: boolean;
  disabled?: boolean;
}) {
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search.trim().toLocaleLowerCase("pt-BR"));
  const selected = useMemo(() => new Set(value), [value]);
  const displayedOptions = useMemo(() => {
    const knownCodes = new Set(options.map((option) => option.value));
    const unavailable = value
      .filter((code) => !knownCodes.has(code))
      .map((code) => ({ value: code, label: `PLU ${code} · fora dos filtros atuais` }));
    const allOptions = [...unavailable, ...options];
    const filtered = deferredSearch
      ? allOptions.filter(
          (option) =>
            option.value.toLocaleLowerCase("pt-BR").includes(deferredSearch) ||
            option.label.toLocaleLowerCase("pt-BR").includes(deferredSearch),
        )
      : allOptions;
    filtered.sort((a, b) => Number(selected.has(b.value)) - Number(selected.has(a.value)));
    return { visible: filtered.slice(0, RESULT_LIMIT), total: filtered.length };
  }, [deferredSearch, options, selected, value]);

  const toggle = (code: string) => {
    onChange(selected.has(code) ? value.filter((item) => item !== code) : [...value, code]);
  };
  const allFilteredSelected =
    options.length > 0 && options.every((option) => selected.has(option.value));
  const selectAllFiltered = () => {
    onChange([...new Set([...value, ...options.map((option) => option.value)])]);
  };

  return (
    <div className="min-w-0 overflow-hidden rounded-md border">
      <div className="flex min-w-0 items-center gap-2 border-b p-2">
        <Search className="size-4 shrink-0 text-muted-foreground" />
        <Input
          aria-label="Buscar produtos para a análise"
          placeholder="Buscar por PLU ou descrição…"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          disabled={disabled}
          className="h-8 min-w-0 border-0 px-0 shadow-none"
        />
        {value.length > 0 ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onChange([])}
            disabled={disabled}
            aria-label="Limpar produtos selecionados"
          >
            <X className="size-4" />
          </Button>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2 text-xs text-muted-foreground">
        <span>{value.length} produto(s) selecionado(s)</span>
        {displayedOptions.total > RESULT_LIMIT ? (
          <span>
            Exibindo {RESULT_LIMIT} de {displayedOptions.total}
          </span>
        ) : null}
      </div>
      <div className="border-b p-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-auto w-full whitespace-normal py-1.5"
          onClick={selectAllFiltered}
          disabled={disabled || loading || options.length === 0 || allFilteredSelected}
        >
          Selecionar todos os {options.length} produtos dos filtros atuais
        </Button>
      </div>
      <div className="min-w-0 max-h-64 overflow-y-auto p-1" role="listbox" aria-label="Produtos">
        {loading ? (
          <p className="p-4 text-center text-sm text-muted-foreground">Carregando produtos…</p>
        ) : displayedOptions.visible.length === 0 ? (
          <p className="p-4 text-center text-sm text-muted-foreground">
            {options.length === 0 && !search
              ? "Selecione uma loja para carregar os produtos."
              : "Nenhum produto encontrado."}
          </p>
        ) : (
          displayedOptions.visible.map((option) => {
            const checked = selected.has(option.value);
            return (
              <div
                key={option.value}
                role="option"
                aria-selected={checked}
                aria-disabled={disabled}
                tabIndex={disabled ? undefined : 0}
                onClick={(event) => {
                  if (disabled) return;
                  if (hasTextSelectionWithin(event.currentTarget)) return;
                  toggle(option.value);
                }}
                onKeyDown={(event) => {
                  if (disabled || (event.key !== "Enter" && event.key !== " ")) return;
                  event.preventDefault();
                  toggle(option.value);
                }}
                className="flex w-full min-w-0 cursor-pointer select-text items-center gap-2 overflow-hidden rounded-sm px-2 py-2 text-left text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring aria-disabled:pointer-events-none aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
              >
                <span
                  className={cn(
                    "flex size-4 shrink-0 items-center justify-center rounded border",
                    checked
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-input bg-background",
                  )}
                >
                  {checked ? <Check className="size-3" /> : null}
                </span>
                <span className="min-w-0 truncate">{option.label}</span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
