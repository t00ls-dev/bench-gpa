import { FilterField } from "@/components/filter-field";
import { MultiSelect } from "@/components/multi-select";
import { TargetDatePicker } from "@/components/target-date-picker";

interface StoreOption {
  store_code: string;
  store_name: string;
}

export function ProductionFilters({
  stores,
  storeCode,
  targetDate,
  onStoreChange,
  onTargetDateChange,
}: {
  stores: StoreOption[];
  storeCode: string | undefined;
  targetDate: string | undefined;
  onStoreChange: (v: string[]) => void;
  onTargetDateChange: (v: string) => void;
}) {
  return (
    <div className="kpi-card mb-4 space-y-3 min-w-0 overflow-hidden">
      <div className="grid gap-3 sm:grid-cols-2 [&>*]:min-w-0">
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
      </div>
    </div>
  );
}
