// Cascade logic shared between FilterBar/index.page (Dashboard) and
// AreaFilters/area.page (Area). The two screens use DIFFERENT strategies to
// compute the available OPTIONS at each level: FilterBar cascades via a
// server query (the dashboard doesn't load the whole hierarchy, due to
// aggregation cost); AreaFilters receives the full hierarchy already
// loaded and cascades in memory. This part is deliberately not unified
// (see docs/continuar.md, item 4): merging them would trade a deliberate
// performance decision for an abstraction.
//
// What IS identical on both screens, and therefore lives here: when a
// level changes, zero out the levels below it in the cascade (switching
// stores doesn't leave a stale subgroup filter pointing at a combination
// that no longer exists).

const CASCADE_LEVELS = ["stores", "deptos", "secoes", "grupos", "subgrupos"] as const;
type CascadeLevel = (typeof CASCADE_LEVELS)[number];
type CascadeFilters = Record<CascadeLevel, string[]>;

/** When setting `level`, returns the patch that zeroes out every level below it in the cascade. */
export function cascadePatch(level: CascadeLevel, value: string[]): Partial<CascadeFilters> {
  const idx = CASCADE_LEVELS.indexOf(level);
  const patch: Partial<CascadeFilters> = { [level]: value };
  for (let i = idx + 1; i < CASCADE_LEVELS.length; i++) {
    patch[CASCADE_LEVELS[i]] = [];
  }
  return patch;
}

export interface HierarchyItem {
  store_code: string;
  store_name: string;
  depto: string | null;
  secao: string | null;
  grupo: string | null;
  subgrupo: string | null;
}

interface AreaCascadeOptions {
  stores: HierarchyItem[];
  deptosOpts: string[];
  secoesOpts: string[];
  gruposOpts: string[];
  subgruposOpts: string[];
}

/**
 * AreaFilters' in-memory cascade: each level filters the subset of the
 * hierarchy that matches the levels already selected above it, and that
 * level's own options come from that subset, never from the entire
 * hierarchy.
 */
export function computeAreaCascadeOptions(
  hierarchy: HierarchyItem[],
  filters: { fStores: string[]; fDeptos: string[]; fSecoes: string[]; fGrupos: string[] },
): AreaCascadeOptions {
  const { fStores, fDeptos, fSecoes, fGrupos } = filters;

  const seen = new Set<string>();
  const stores = hierarchy.filter((r) => {
    if (seen.has(r.store_code)) return false;
    seen.add(r.store_code);
    return true;
  });

  const deptoBase =
    fStores.length === 0 ? hierarchy : hierarchy.filter((r) => fStores.includes(r.store_code));
  const deptosOpts = [...new Set(deptoBase.map((r) => r.depto).filter(Boolean) as string[])].sort();

  const secaoBase =
    fDeptos.length === 0
      ? deptoBase
      : deptoBase.filter((r) => r.depto && fDeptos.includes(r.depto));
  const secoesOpts = [...new Set(secaoBase.map((r) => r.secao).filter(Boolean) as string[])].sort();

  const grupoBase =
    fSecoes.length === 0
      ? secaoBase
      : secaoBase.filter((r) => r.secao && fSecoes.includes(r.secao));
  const gruposOpts = [...new Set(grupoBase.map((r) => r.grupo).filter(Boolean) as string[])].sort();

  const subgrupoBase =
    fGrupos.length === 0
      ? grupoBase
      : grupoBase.filter((r) => r.grupo && fGrupos.includes(r.grupo));
  const subgruposOpts = [
    ...new Set(subgrupoBase.map((r) => r.subgrupo).filter(Boolean) as string[]),
  ].sort();

  return { stores, deptosOpts, secoesOpts, gruposOpts, subgruposOpts };
}
