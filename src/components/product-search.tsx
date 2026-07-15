import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ProductHierarchyTrail } from "@/components/product-hierarchy-trail";
import { Search, Package, X, Loader2 } from "lucide-react";

interface Suggestion {
  prod_code: string;
  prod_name: string;
}

export function ProductSearch({
  query,
  debounced,
  selected,
  suggestions,
  searchFetching,
  onQueryChange,
  onSelect,
  onClear,
}: {
  query: string;
  debounced: string;
  selected: { prod_code: string; prod_name: string } | null;
  suggestions: Suggestion[] | undefined;
  searchFetching: boolean;
  product?: { depto: string | null; secao: string | null; grupo: string | null; subgrupo: string | null } | null | undefined;
  onQueryChange: (v: string) => void;
  onSelect: (s: Suggestion) => void;
  onClear: () => void;
}) {
  return (
    <div className="kpi-card relative">
      <div className="flex items-center gap-2 flex-wrap">
        <Search className="size-4 shrink-0 text-muted-foreground" />
        <Input
          className="min-w-[180px] flex-1 border-0 shadow-none focus-visible:ring-1 focus-visible:ring-ring"
          placeholder="Digite ao menos 3 caracteres (nome ou código)…"
          value={query}
          onChange={(e) => {
            onQueryChange(e.target.value);
            if (!e.target.value) onClear();
          }}
        />
        {(query.length > 0 || selected) && (
          <Button variant="ghost" size="sm" onClick={onClear} className="h-7 gap-1 text-xs text-muted-foreground">
            <X className="size-3" /> Limpar
          </Button>
        )}
        {selected && (
          <Button variant="outline" size="sm" onClick={onClear} className="h-7 text-xs">
            Trocar produto
          </Button>
        )}
      </div>
      {selected && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/5 px-2 py-0.5 text-xs text-primary">
            <Package className="size-3" />
            <span className="font-mono">{selected.prod_code}</span>
            <span className="truncate max-w-[40vw] sm:max-w-[260px]">{selected.prod_name}</span>
          </span>
        </div>
      )}
      {!selected &&
        debounced.length >= 3 &&
        (searchFetching || (suggestions && suggestions.length > 0)) && (
          <ul className="absolute left-0 right-0 top-full z-20 mt-1 max-h-80 overflow-y-auto rounded-lg border border-border bg-popover shadow-lg">
            {searchFetching && (
              <li className="flex items-center justify-center gap-2 px-3 py-4 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" /> Buscando…
              </li>
            )}
            {!searchFetching &&
              suggestions?.map((s) => (
                <li key={s.prod_code}>
                  <button
                    onClick={() => onSelect(s)}
                    className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-muted"
                  >
                    <Package className="size-4 text-muted-foreground" />
                    <span className="font-mono text-xs text-muted-foreground">{s.prod_code}</span>
                    <span className="truncate">{s.prod_name}</span>
                  </button>
                </li>
              ))}
          </ul>
        )}
    </div>
  );
}
