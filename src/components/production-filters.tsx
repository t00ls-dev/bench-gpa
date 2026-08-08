import { useMemo } from "react";
import { FilterField } from "@/components/filter-field";
import { MultiSelect, type MSOption } from "@/components/multi-select";
import { TargetDatePicker } from "@/components/target-date-picker";
import type { ProductionFilterOption } from "@/lib/api-types";

interface StoreOption {
  store_code: string;
  store_name: string;
}

export function ProductionFilters({
  stores,
  storeCode,
  targetDate,
  filterOptions,
  secoes,
  grupos,
  productOptions,
  productFilter,
  onStoreChange,
  onTargetDateChange,
  onSecoesChange,
  onGruposChange,
  onProductFilterChange,
}: {
  stores: StoreOption[];
  storeCode: string | undefined;
  targetDate: string | undefined;
  filterOptions: ProductionFilterOption[];
  secoes: string[];
  grupos: string[];
  productOptions: MSOption[];
  productFilter: string[];
  onStoreChange: (v: string[]) => void;
  onTargetDateChange: (v: string) => void;
  onSecoesChange: (v: string[]) => void;
  onGruposChange: (v: string[]) => void;
  onProductFilterChange: (v: string[]) => void;
}) {
  const secaoOptions = useMemo(
    () =>
      [...new Set(filterOptions.map((o) => o.secao))].sort().map((s) => ({ value: s, label: s })),
    [filterOptions],
  );

  // Cascade: with no seção selected, every grupo is available; once one or
  // more seções are picked, narrow to only the grupos that occur under them
  // (same in-memory cascade spirit as computeAreaCascadeOptions, but for
  // just these 2 levels).
  const grupoOptions = useMemo(() => {
    const scoped =
      secoes.length === 0 ? filterOptions : filterOptions.filter((o) => secoes.includes(o.secao));
    return [...new Set(scoped.map((o) => o.grupo).filter((g): g is string => g !== null))]
      .sort()
      .map((g) => ({ value: g, label: g }));
  }, [filterOptions, secoes]);

  return (
    <div className="kpi-card mb-4 space-y-3 min-w-0 overflow-hidden">
      <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-5 [&>*]:min-w-0">
        <FilterField label="Loja">
          <MultiSelect
            single
            label="Selecione"
            options={stores.map((s) => ({
              value: s.store_code,
              label: `${s.store_code} - ${s.store_name}`,
            }))}
            value={storeCode ? [storeCode] : []}
            onChange={(v) => onStoreChange(v)}
          />
        </FilterField>
        <FilterField label="Dia">
          <div className="mt-1">
            <TargetDatePicker value={targetDate} onChange={onTargetDateChange} />
          </div>
        </FilterField>
        <FilterField label="Seção">
          <MultiSelect
            label="Todas"
            options={secaoOptions}
            value={secoes}
            onChange={onSecoesChange}
          />
        </FilterField>
        <FilterField label="Grupo">
          <MultiSelect
            label="Todos"
            options={grupoOptions}
            value={grupos}
            onChange={onGruposChange}
          />
        </FilterField>
        <FilterField label="Produto">
          <MultiSelect
            label="Todos"
            searchable
            options={productOptions}
            value={productFilter}
            onChange={onProductFilterChange}
          />
        </FilterField>
      </div>
    </div>
  );
}
