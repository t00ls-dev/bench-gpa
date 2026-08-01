// Lógica de cascata compartilhada entre FilterBar/index.page (Dashboard) e
// AreaFilters/area.page (Área). As duas telas usam estratégias DIFERENTES
// para calcular as OPÇÕES disponíveis em cada nível: FilterBar busca em
// cascata via query no servidor (dashboard não carrega a hierarquia inteira,
// pelo custo de agregação); AreaFilters recebe a hierarquia completa já
// carregada e cascateia em memória. Essa parte não é unificada de propósito
// (ver docs/continuar.md, item 4): fundir trocaria uma decisão de
// performance deliberada por uma abstração.
//
// O que É idêntico nas duas telas, e por isso vive aqui: ao trocar um nível,
// zerar os níveis dependentes (trocar de loja não deixa filtro de subgrupo
// órfão apontando pra uma combinação que não existe mais).

const CASCADE_LEVELS = ["stores", "deptos", "secoes", "grupos", "subgrupos"] as const;
type CascadeLevel = (typeof CASCADE_LEVELS)[number];
type CascadeFilters = Record<CascadeLevel, string[]>;

/** Ao setar `level`, devolve o patch que zera todo nível abaixo dele na cascata. */
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
 * Cascata em memória do AreaFilters: cada nível filtra o subconjunto da
 * hierarquia que casa com os níveis já selecionados acima dele, e as opções
 * do próprio nível saem desse subconjunto, nunca da hierarquia inteira.
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
