import { X } from "lucide-react";
import { type Filters } from "@/components/filter-bar";

interface Props {
  filters: Filters;
  onChange: (f: Filters) => void;
}

export function FilterChips({ filters, onChange }: Props) {
  const chips: { label: string; onRemove: () => void }[] = [];

  for (const code of filters.stores) {
    chips.push({
      label: `Loja ${code}`,
      onRemove: () =>
        onChange({ ...filters, stores: filters.stores.filter((c) => c !== code), deptos: [], secoes: [], grupos: [], subgrupos: [] }),
    });
  }

  for (const depto of filters.deptos) {
    chips.push({
      label: depto,
      onRemove: () =>
        onChange({ ...filters, deptos: filters.deptos.filter((c) => c !== depto), secoes: [], grupos: [], subgrupos: [] }),
    });
  }

  for (const secao of filters.secoes) {
    chips.push({
      label: secao,
      onRemove: () =>
        onChange({ ...filters, secoes: filters.secoes.filter((c) => c !== secao), grupos: [], subgrupos: [] }),
    });
  }

  for (const grupo of filters.grupos) {
    chips.push({
      label: grupo,
      onRemove: () =>
        onChange({ ...filters, grupos: filters.grupos.filter((c) => c !== grupo), subgrupos: [] }),
    });
  }

  for (const sub of filters.subgrupos) {
    chips.push({
      label: sub,
      onRemove: () =>
        onChange({ ...filters, subgrupos: filters.subgrupos.filter((c) => c !== sub) }),
    });
  }

  if (chips.length === 0) return null;

  return (
    <div className="mb-4 flex flex-wrap gap-1.5" aria-label="Filtros ativos">
      {chips.map((c) => (
        <button
          key={c.label}
          type="button"
          aria-label={`Remover filtro ${c.label}`}
          onClick={c.onRemove}
          className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2.5 py-1 text-xs font-medium text-foreground transition hover:border-destructive/50 hover:text-destructive"
        >
          {c.label}
          <X className="size-3" aria-hidden="true" />
        </button>
      ))}
    </div>
  );
}
