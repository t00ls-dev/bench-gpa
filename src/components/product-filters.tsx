import { Label } from "@/components/ui/label";
import { MultiSelect } from "@/components/multi-select";

interface StoreOption {
  store_code: string;
  store_name: string;
}

export function ProductFilters({
  stores,
  departments,
  storeCodes,
  department,
  onStoreCodesChange,
  onDepartmentChange,
}: {
  stores: StoreOption[];
  departments: string[];
  storeCodes: string[];
  department: string | null;
  onStoreCodesChange: (value: string[]) => void;
  onDepartmentChange: (value: string | null) => void;
}) {
  return (
    <div className="kpi-card mb-4 grid min-w-0 gap-3 overflow-hidden md:grid-cols-2 [&>*]:min-w-0">
      <div>
        <Label className="text-xs">Loja</Label>
        <MultiSelect
          label="Todas as lojas"
          ariaLabel="Loja"
          options={stores.map((store) => ({
            value: store.store_code,
            label: `${store.store_code} - ${store.store_name}`,
          }))}
          value={storeCodes}
          onChange={(value) => {
            onStoreCodesChange(value);
            if (department) onDepartmentChange(null);
          }}
        />
      </div>
      <div>
        <Label className="text-xs">Departamento</Label>
        <MultiSelect
          single
          label="Todos os departamentos"
          ariaLabel="Departamento"
          options={departments.map((value) => ({ value, label: value }))}
          value={department ? [department] : []}
          onChange={(value) => onDepartmentChange(value[0] ?? null)}
        />
      </div>
    </div>
  );
}
