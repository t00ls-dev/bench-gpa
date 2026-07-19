import { useMemo } from "react";
import { Label } from "@/components/ui/label";
import { DateRangePicker } from "@/components/date-range-picker";
import { MultiSelect } from "@/components/multi-select";

interface HierarchyItem {
  store_code: string;
  store_name: string;
  depto: string | null;
  secao: string | null;
  grupo: string | null;
  subgrupo: string | null;
}

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
  const stores = useMemo(() => {
    const seen = new Set<string>();
    return hierarchy.filter((r) => {
      if (seen.has(r.store_code)) return false;
      seen.add(r.store_code);
      return true;
    });
  }, [hierarchy]);

  const deptoBase = useMemo(
    () =>
      fStores.length === 0 ? hierarchy : hierarchy.filter((r) => fStores.includes(r.store_code)),
    [hierarchy, fStores],
  );
  const deptosOpts = useMemo(
    () => [...new Set(deptoBase.map((r) => r.depto).filter(Boolean) as string[])].sort(),
    [deptoBase],
  );

  const secaoBase = useMemo(
    () =>
      fDeptos.length === 0
        ? deptoBase
        : deptoBase.filter((r) => r.depto && fDeptos.includes(r.depto)),
    [deptoBase, fDeptos],
  );
  const secoesOpts = useMemo(
    () => [...new Set(secaoBase.map((r) => r.secao).filter(Boolean) as string[])].sort(),
    [secaoBase],
  );

  const grupoBase = useMemo(
    () =>
      fSecoes.length === 0
        ? secaoBase
        : secaoBase.filter((r) => r.secao && fSecoes.includes(r.secao)),
    [secaoBase, fSecoes],
  );
  const gruposOpts = useMemo(
    () => [...new Set(grupoBase.map((r) => r.grupo).filter(Boolean) as string[])].sort(),
    [grupoBase],
  );

  const subgrupoBase = useMemo(
    () =>
      fGrupos.length === 0
        ? grupoBase
        : grupoBase.filter((r) => r.grupo && fGrupos.includes(r.grupo)),
    [grupoBase, fGrupos],
  );
  const subgruposOpts = useMemo(
    () => [...new Set(subgrupoBase.map((r) => r.subgrupo).filter(Boolean) as string[])].sort(),
    [subgrupoBase],
  );

  return (
    <div className="kpi-card mb-4 space-y-3 min-w-0 overflow-hidden">
      <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-6 [&>*]:min-w-0">
        <div className="lg:col-span-2">
          <Label className="text-xs">Período</Label>
          <div className="mt-1">
            <DateRangePicker
              from={dateFrom}
              to={dateTo}
              reference={latestDate}
              availableDates={availableDates}
              onChange={onRangeChange}
            />
          </div>
        </div>
        <div>
          <Label className="text-xs">Loja</Label>
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
        </div>
        <div>
          <Label className="text-xs">Departamento</Label>
          <MultiSelect
            single
            label="Selecione"
            options={deptosOpts.map((d) => ({ value: d, label: d }))}
            value={fDeptos}
            onChange={onDeptosChange}
          />
        </div>
        <div>
          <Label className="text-xs">Seção</Label>
          <MultiSelect
            label="Todas"
            options={secoesOpts.map((s) => ({ value: s, label: s }))}
            value={fSecoes}
            onChange={onSecoesChange}
          />
        </div>
        <div>
          <Label className="text-xs">Grupo</Label>
          <MultiSelect
            label="Todos"
            options={gruposOpts.map((g) => ({ value: g, label: g }))}
            value={fGrupos}
            onChange={onGruposChange}
          />
        </div>
        <div className="md:col-span-2">
          <Label className="text-xs">Subgrupo</Label>
          <MultiSelect
            label="Todos"
            options={subgruposOpts.map((s) => ({ value: s, label: s }))}
            value={fSubgrupos}
            onChange={onSubgruposChange}
          />
        </div>
      </div>
    </div>
  );
}
