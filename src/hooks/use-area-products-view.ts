import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getAreaAnalysis, getAreaFilterHierarchy } from "@/lib/area.functions";
import { PAGE_SIZE_OPTIONS } from "@/lib/schemas";
import { usePersistentState } from "@/hooks/use-persistent-state";
import { QUERY_STALE_CORE, QUERY_STALE_REFERENCE, QUERY_GC_REFERENCE } from "@/lib/query-config";
import { defaultDateWindow } from "@/lib/date-window";
import { cascadePatch } from "@/lib/filter-cascade";
import { useResetOnChange } from "@/hooks/use-reset-on-change";

export type AreaProduct = {
  prod_code: string;
  prod_name: string;
  depto: string | null;
  secao: string | null;
  grupo: string | null;
  subgrupo: string | null;
  val: number;
  lastSaleDate: string | null;
};

export type AreaSortKey = "prod_code" | "prod_name" | "val" | "daysSince";

export type AreaFilters = {
  dateFrom: string;
  dateTo: string;
  stores: string[];
  deptos: string[];
  secoes: string[];
  grupos: string[];
  subgrupos: string[];
};

export interface AreaSearchParams {
  store?: string;
  depto?: string;
  secao?: string;
  grupo?: string;
  subgrupo?: string;
}

const isoDate = /^\d{4}-\d{2}-\d{2}$/;
function sanitizeAF(f: AreaFilters): AreaFilters {
  let dateFrom = isoDate.test(f.dateFrom) ? f.dateFrom : "";
  let dateTo = isoDate.test(f.dateTo) ? f.dateTo : "";
  // Guard against a reversed range (e.g. persisted from an old session):
  // it makes queries return no data and crashes the calendar picker.
  if (dateFrom && dateTo && dateFrom > dateTo) [dateFrom, dateTo] = [dateTo, dateFrom];
  return { ...f, dateFrom, dateTo };
}

/**
 * Estado de filtros, hierarquia, busca/ordenação/paginação e a query de
 * produtos da tela de Área, tudo que não é exportação de PDF nem JSX.
 * Extraído de `area.page.tsx` (auditoria técnica de 31/07, item "4
 * responsabilidades"); `getArea`/`useServerFn` fica de fora porque o export de
 * PDF em `useAreaPdfExport` também precisa dele, evitando dois server-fn
 * distintos para a mesma rota.
 */
export function useAreaProductsView(
  getArea: ReturnType<typeof useServerFn<typeof getAreaAnalysis>>,
  searchParams: AreaSearchParams,
) {
  const getHierarchy = useServerFn(getAreaFilterHierarchy);

  const [af, setAf] = usePersistentState<AreaFilters>(
    "bench-gpa:filters:area:v2",
    {
      dateFrom: "",
      dateTo: "",
      stores: [],
      deptos: [],
      secoes: [],
      grupos: [],
      subgrupos: [],
    },
    sanitizeAF,
  );
  // Atualização funcional de propósito: se dois efeitos chamarem patch() no
  // mesmo commit (ex.: hierarquia já em cache faz o efeito de período padrão
  // e o de click-through do Dashboard disputarem o primeiro render), cada
  // `setAf({...af, ...p})` calculado a partir do MESMO `af` (fechamento
  // parado no render anterior) apaga o patch do outro: só o último a
  // "vencer" sobrevive. `setAf(prev => ...)` sempre parte do estado mais
  // recente, mesmo entre updates do mesmo commit.
  const patch = (p: Partial<AreaFilters>) => setAf((prev) => ({ ...prev, ...p }));
  const setStores = (v: string[]) => patch(cascadePatch("stores", v));
  const setDeptos = (v: string[]) => patch(cascadePatch("deptos", v));
  const setSecoes = (v: string[]) => patch(cascadePatch("secoes", v));
  const setGrupos = (v: string[]) => patch(cascadePatch("grupos", v));
  const setSubgrupos = (v: string[]) => patch({ subgrupos: v });
  const setRange = (r: { from: string; to: string }) => patch({ dateFrom: r.from, dateTo: r.to });

  // Click-through do ranking do Dashboard (?store=&depto=&secao=&grupo=&subgrupo=):
  // substitui os filtros de categoria persistidos pelo nível clicado, uma
  // única vez por navegação, não deve reaplicar se o usuário mudar os
  // filtros depois (por isso o guard em ref em vez de rodar a cada render).
  const appliedSearchRef = useRef(false);
  useEffect(() => {
    if (appliedSearchRef.current) return;
    const { store, depto, secao, grupo, subgrupo } = searchParams;
    if (!store && !depto && !secao && !grupo && !subgrupo) return;
    appliedSearchRef.current = true;
    patch({
      stores: store ? [store] : af.stores,
      deptos: depto ? [depto] : [],
      secoes: secao ? [secao] : [],
      grupos: grupo ? [grupo] : [],
      subgrupos: subgrupo ? [subgrupo] : [],
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const {
    dateFrom,
    dateTo,
    stores: fStores,
    deptos: fDeptos,
    secoes: fSecoes,
    grupos: fGrupos,
    subgrupos: fSubgrupos,
  } = af;

  const hierQ = useQuery({
    queryKey: ["area-filter-hierarchy"],
    queryFn: () => getHierarchy({}),
    staleTime: QUERY_STALE_REFERENCE,
    gcTime: QUERY_GC_REFERENCE,
  });
  const hierData = hierQ.data;
  // useMemo porque o `?? []` criava um array novo a cada render, e `hierarchy` é
  // dependência do useMemo de `stores`, que portanto recalculava sempre.
  const hierarchy = useMemo(() => hierData?.hierarchy ?? [], [hierData]);
  const opts = hierData;

  const baseDateIso = dateTo || opts?.latestDate || undefined;
  // useCallback para poder entrar como dependência do useMemo de `products` sem
  // recriar a função (e invalidar o memo) a cada render.
  const daysSinceNum = useCallback(
    (iso: string | null): number | null => {
      if (!iso || !baseDateIso) return null;
      return Math.floor(
        (new Date(baseDateIso + "T00:00:00").getTime() - new Date(iso + "T00:00:00").getTime()) /
          86400000,
      );
    },
    [baseDateIso],
  );
  const daysSinceLabel = (iso: string | null): string => {
    const n = daysSinceNum(iso);
    return n === null ? "-" : String(n);
  };

  useEffect(() => {
    if (opts?.latestDate && (!dateFrom || !dateTo)) {
      const avail = (opts?.availableDates ?? []) as string[];
      const win = defaultDateWindow(avail, opts.latestDate);
      if (win) setRange(win);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts?.latestDate]);

  useEffect(() => {
    const avail = (opts?.availableDates ?? []) as string[];
    if (!avail.length || !dateFrom || !dateTo) return;
    const within = avail.filter((d) => d >= dateFrom && d <= dateTo);
    if (within.length === 0 && opts?.latestDate) {
      setRange({ from: opts.latestDate, to: opts.latestDate });
    } else if (within.length && (within[0] !== dateFrom || within[within.length - 1] !== dateTo)) {
      setRange({ from: within[0], to: within[within.length - 1] });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts?.availableDates]);

  const ready = !!dateFrom && !!dateTo && fStores.length > 0 && fDeptos.length > 0;

  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<AreaSortKey>("val");
  const [sortAsc, setSortAsc] = useState(false);
  const [pageSize, setPageSize] = useState<(typeof PAGE_SIZE_OPTIONS)[number]>(50);
  const [page, setPage] = useState(1);
  const sortDir: "asc" | "desc" = sortAsc ? "asc" : "desc";

  useResetOnChange(
    [
      search,
      sortKey,
      sortAsc,
      pageSize,
      dateFrom,
      dateTo,
      fStores,
      fDeptos,
      fSecoes,
      fGrupos,
      fSubgrupos,
    ],
    () => setPage(1),
  );

  const { data, isFetching, isLoading, isError, error, refetch } = useQuery({
    queryKey: [
      "area-analysis",
      dateFrom,
      dateTo,
      fStores,
      fDeptos,
      fSecoes,
      fGrupos,
      fSubgrupos,
      page,
      pageSize,
      search,
      sortKey,
      sortDir,
    ],
    queryFn: () =>
      getArea({
        data: {
          dateFrom,
          dateTo,
          stores: fStores,
          deptos: fDeptos,
          secoes: fSecoes,
          grupos: fGrupos,
          subgrupos: fSubgrupos,
          page,
          pageSize,
          search,
          sortBy: sortKey,
          sortDir,
        },
      }),
    enabled: ready,
    staleTime: QUERY_STALE_CORE,
    retry: 1,
    placeholderData: (prev) => prev,
  });

  const products = useMemo(() => {
    const raw = (data?.products ?? []) as AreaProduct[];
    if (sortKey !== "daysSince") return raw;
    return [...raw].sort((a, b) => {
      const aD = daysSinceNum(a.lastSaleDate);
      const bD = daysSinceNum(b.lastSaleDate);
      const aN = aD === null;
      const bN = bD === null;
      const cmp = aN && bN ? 0 : aN ? 1 : bN ? -1 : aD - bD;
      return sortAsc ? cmp : -cmp;
    });
  }, [data, sortKey, sortAsc, daysSinceNum]);
  const total = data?.total ?? 0;
  const noSale = data?.plusWithoutSale ?? 0;
  const totalRows = data?.totalProducts ?? 0;
  const totalPages = data?.totalPages ?? 1;

  const toggleSort = (k: AreaSortKey) => {
    if (sortKey === k) setSortAsc(!sortAsc);
    else {
      setSortKey(k);
      setSortAsc(k === "prod_code" || k === "prod_name");
    }
  };

  const stores = useMemo(() => {
    const seen = new Set<string>();
    return hierarchy.filter((r) => {
      if (seen.has(r.store_code)) return false;
      seen.add(r.store_code);
      return true;
    });
  }, [hierarchy]);

  const pathParts: string[] = [];
  if (fStores.length === 0) pathParts.push("Todas as lojas");
  else if (fStores.length === 1) {
    const s = stores.find((x) => x.store_code === fStores[0]);
    pathParts.push("Loja " + (s ? s.store_code + " - " + s.store_name : fStores[0]));
  } else pathParts.push(fStores.length + " lojas");
  const summarize = (arr: string[], many: string) =>
    arr.length === 1 ? arr[0] : arr.length > 1 ? arr.length + " " + many : null;
  const dp = summarize(fDeptos, "departamentos");
  if (dp) pathParts.push(dp);
  const sc = summarize(fSecoes, "seções");
  if (sc) pathParts.push(sc);
  const gp = summarize(fGrupos, "grupos");
  if (gp) pathParts.push(gp);
  const sg = summarize(fSubgrupos, "subgrupos");
  if (sg) pathParts.push(sg);

  return {
    af,
    setStores,
    setDeptos,
    setSecoes,
    setGrupos,
    setSubgrupos,
    setRange,
    dateFrom,
    dateTo,
    fStores,
    fDeptos,
    fSecoes,
    fGrupos,
    fSubgrupos,
    hierarchy,
    opts,
    baseDateIso,
    daysSinceNum,
    daysSinceLabel,
    ready,
    search,
    setSearch,
    sortKey,
    sortAsc,
    sortDir,
    toggleSort,
    pageSize,
    setPageSize,
    page,
    setPage,
    data,
    isFetching,
    isLoading,
    isError,
    error,
    refetch,
    products,
    total,
    noSale,
    totalRows,
    totalPages,
    stores,
    pathParts,
  };
}
