import { useMemo } from "react";
import { DateRangePicker } from "@/components/date-range-picker";
import { MultiSelect } from "@/components/multi-select";
import { FilterField } from "@/components/filter-field";
import { computeAreaCascadeOptions, type HierarchyItem } from "@/lib/filter-cascade";

export function AreaFilters({
  hierarchy,
  dateFrom,
  dateTo,
  fStores,
  fDeptos,
  fSecoes,
  fGrupos,
  fSubgrupos,
  latestDate,
  availableDates,
  onRangeChange,
  onStoresChange,
  onDeptosChange,
  onSecoesChange,
  onGruposChange,
  onSubgruposChange,
}: {
  hierarchy: HierarchyItem[];
  dateFrom: string;
  dateTo: string;
  fStores: string[];
  fDeptos: string[];
  fSecoes: string[];
  fGrupos: string[];
  fSubgrupos: string[];
  latestDate?: string;
  availableDates: string[];
  onRangeChange: (r: { from: string; to: string }) => void;
  onStoresChange: (v: string[]) => void;
  onDeptosChange: (v: string[]) => void;
  onSecoesChange: (v: string[]) => void;
  onGruposChange: (v: string[]) => void;
  onSubgruposChange: (v: string[]) => void;
}) {
  // Cascata em memória: cada nível filtra o subconjunto da hierarquia que já
  // casa com os níveis selecionados acima dele. Lógica pura testada em
  // src/lib/filter-cascade.test.ts, ver comentário lá sobre por que essa
  // estratégia (em memória) não é unificada com a do FilterBar (server-side).
  const { stores, deptosOpts, secoesOpts, gruposOpts, subgruposOpts } = useMemo(
    () => computeAreaCascadeOptions(hierarchy, { fStores, fDeptos, fSecoes, fGrupos }),
    [hierarchy, fStores, fDeptos, fSecoes, fGrupos],
  );

  return (
    <div className="kpi-card mb-4 space-y-3 min-w-0 overflow-hidden">
      <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-6 [&>*]:min-w-0">
        <FilterField label="Período" className="lg:col-span-2">
          <div className="mt-1">
            <DateRangePicker
              from={dateFrom}
              to={dateTo}
              reference={latestDate}
              availableDates={availableDates}
              onChange={onRangeChange}
            />
          </div>
        </FilterField>
        <FilterField label="Loja">
          <MultiSelect
            single
            label="Selecione"
            options={stores.map((s) => ({
              value: s.store_code,
              label: `${s.store_code} - ${s.store_name}`,
            }))}
            value={fStores}
            onChange={onStoresChange}
          />
        </FilterField>
        <FilterField label="Departamento">
          <MultiSelect
            single
            label="Selecione"
            options={deptosOpts.map((d) => ({ value: d, label: d }))}
            value={fDeptos}
            onChange={onDeptosChange}
          />
        </FilterField>
        <FilterField label="Seção">
          <MultiSelect
            label="Todas"
            noun={{ one: "seção", other: "seções" }}
            options={secoesOpts.map((s) => ({ value: s, label: s }))}
            value={fSecoes}
            onChange={onSecoesChange}
          />
        </FilterField>
        <FilterField label="Grupo">
          <MultiSelect
            label="Todos"
            noun={{ one: "grupo", other: "grupos" }}
            options={gruposOpts.map((g) => ({ value: g, label: g }))}
            value={fGrupos}
            onChange={onGruposChange}
          />
        </FilterField>
        <FilterField label="Subgrupo" className="md:col-span-2">
          <MultiSelect
            label="Todos"
            noun={{ one: "subgrupo", other: "subgrupos" }}
            options={subgruposOpts.map((s) => ({ value: s, label: s }))}
            value={fSubgrupos}
            onChange={onSubgruposChange}
          />
        </FilterField>
      </div>
    </div>
  );
}
