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
  secao,
  grupos,
  subgrupos,
  productOptions,
  productFilter,
  onStoreChange,
  onTargetDateChange,
  onSecaoChange,
  onGruposChange,
  onSubgruposChange,
  onProductFilterChange,
}: {
  stores: StoreOption[];
  storeCode: string | undefined;
  targetDate: string | undefined;
  filterOptions: ProductionFilterOption[];
  secao: string | undefined;
  grupos: string[];
  subgrupos: string[];
  productOptions: MSOption[];
  productFilter: string[];
  onStoreChange: (v: string[]) => void;
  onTargetDateChange: (v: string) => void;
  onSecaoChange: (v: string[]) => void;
  onGruposChange: (v: string[]) => void;
  onSubgruposChange: (v: string[]) => void;
  onProductFilterChange: (v: string[]) => void;
}) {
  const secaoOptions = useMemo(
    () =>
      [...new Set(filterOptions.map((o) => o.secao))].sort().map((s) => ({ value: s, label: s })),
    [filterOptions],
  );

  // Cascade: the forecast only becomes meaningful after a seção is
  // picked, so grupos stay scoped to that seção instead of listing the
  // whole store catalog.
  const grupoOptions = useMemo(() => {
    const scoped = secao ? filterOptions.filter((o) => o.secao === secao) : [];
    return [...new Set(scoped.map((o) => o.grupo).filter((g): g is string => g !== null))]
      .sort()
      .map((g) => ({ value: g, label: g }));
  }, [filterOptions, secao]);

  // Same idea one level deeper, no seção means no subgrupo scope yet.
  const subgrupoOptions = useMemo(() => {
    let scoped = secao ? filterOptions.filter((o) => o.secao === secao) : [];
    if (grupos.length > 0)
      scoped = scoped.filter((o) => o.grupo !== null && grupos.includes(o.grupo));
    return [...new Set(scoped.map((o) => o.subgrupo).filter((sg): sg is string => sg !== null))]
      .sort()
      .map((sg) => ({ value: sg, label: sg }));
  }, [filterOptions, secao, grupos]);

  return (
    <div className="kpi-card mb-4 space-y-3 min-w-0 overflow-hidden">
      <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-6 [&>*]:min-w-0">
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
            single
            label="Todas"
            options={secaoOptions}
            value={secao ? [secao] : []}
            onChange={onSecaoChange}
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
        <FilterField label="Subgrupo">
          <MultiSelect
            label="Todos"
            options={subgrupoOptions}
            value={subgrupos}
            onChange={onSubgruposChange}
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
