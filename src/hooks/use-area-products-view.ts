import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  getAreaAnalysis,
  getAreaFilterHierarchy,
  getAreaProductFilterOptions,
} from "@/lib/area.functions";
import { DEFAULT_PAGE_SIZE, PAGE_SIZE_OPTIONS } from "@/lib/schemas";
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
  products: string[];
};

export interface AreaSearchParams {
  store?: string;
  depto?: string;
  secao?: string;
  grupo?: string;
  subgrupo?: string;
}

export interface SavedAreaComposition {
  id: string;
  storeCode: string;
  productCodes: string[];
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

function applySavedComposition(
  filters: AreaFilters,
  savedComposition?: SavedAreaComposition,
): AreaFilters {
  if (!savedComposition) return filters;
  return {
    ...filters,
    stores: [savedComposition.storeCode],
    deptos: [],
    secoes: [],
    grupos: [],
    subgrupos: [],
    products: [...savedComposition.productCodes],
  };
}

/**
 * Filter/hierarchy/search/sort/pagination state and the products query for
 * the Area screen, everything that isn't PDF export or JSX. Extracted from
 * `area.page.tsx` (technical audit 07/31, "4 responsibilities" item);
 * `getArea`/`useServerFn` stays out because the PDF export in
 * `useAreaPdfExport` also needs it, avoiding two distinct server-fns for the
 * same route.
 */
export function useAreaProductsView(
  getArea: ReturnType<typeof useServerFn<typeof getAreaAnalysis>>,
  searchParams: AreaSearchParams,
  savedComposition?: SavedAreaComposition,
) {
  const getHierarchy = useServerFn(getAreaFilterHierarchy);
  const getProductOptions = useServerFn(getAreaProductFilterOptions);

  const initialFilters = applySavedComposition(
    {
      dateFrom: "",
      dateTo: "",
      stores: [],
      deptos: [],
      secoes: [],
      grupos: [],
      subgrupos: [],
      products: [],
    },
    savedComposition,
  );
  const [af, setAf] = usePersistentState<AreaFilters>(
    savedComposition
      ? `bench-gpa:filters:area:saved:${savedComposition.id}`
      : "bench-gpa:filters:area:v2",
    initialFilters,
    (filters) => applySavedComposition(sanitizeAF(filters), savedComposition),
  );
  const savedCompositionKey = savedComposition
    ? `${savedComposition.id}:${savedComposition.storeCode}:${savedComposition.productCodes.join("\0")}`
    : "";
  const appliedCompositionRef = useRef(savedCompositionKey);
  useEffect(() => {
    if (!savedComposition || appliedCompositionRef.current === savedCompositionKey) return;
    appliedCompositionRef.current = savedCompositionKey;
    setAf((prev) => applySavedComposition(prev, savedComposition));
  }, [savedComposition, savedCompositionKey, setAf]);
  // Deliberately functional update: if two effects call patch() in the same
  // commit (e.g. hierarchy already cached makes the default-period effect
  // and the Dashboard click-through effect race for the first render), each
  // `setAf({...af, ...p})` computed from the SAME `af` (closure frozen at
  // the previous render) wipes out the other's patch: only the last one to
  // "win" survives. `setAf(prev => ...)` always starts from the freshest
  // state, even across updates within the same commit.
  const patch = (p: Partial<AreaFilters>) => setAf((prev) => ({ ...prev, ...p }));
  const withProductsCleared = (p: Partial<AreaFilters>): Partial<AreaFilters> => ({
    ...p,
    products: [],
  });
  const setStores = (v: string[]) => patch(withProductsCleared(cascadePatch("stores", v)));
  const setDeptos = (v: string[]) => patch(withProductsCleared(cascadePatch("deptos", v)));
  const setSecoes = (v: string[]) => patch(withProductsCleared(cascadePatch("secoes", v)));
  const setGrupos = (v: string[]) => patch(withProductsCleared(cascadePatch("grupos", v)));
  const setSubgrupos = (v: string[]) => patch({ subgrupos: v, products: [] });
  const setProducts = (v: string[]) => patch({ products: v });
  const setRange = (r: { from: string; to: string }) => patch({ dateFrom: r.from, dateTo: r.to });

  // Dashboard ranking click-through (?store=&depto=&secao=&grupo=&subgrupo=):
  // replaces the persisted category filters with the clicked level, once
  // per navigation. Must not reapply if the user changes the filters
  // afterward (hence the ref guard instead of running on every render).
  const appliedSearchRef = useRef(false);
  useEffect(() => {
    if (appliedSearchRef.current) return;
    const { store, depto, secao, grupo, subgrupo } = searchParams;
    if (!store && !depto && !secao && !grupo && !subgrupo) return;
    appliedSearchRef.current = true;
    setAf((prev) => ({
      ...prev,
      stores: store ? [store] : [],
      deptos: depto ? [depto] : [],
      secoes: secao ? [secao] : [],
      grupos: grupo ? [grupo] : [],
      subgrupos: subgrupo ? [subgrupo] : [],
      products: [],
    }));
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
    products: fProducts,
  } = af;

  const hierQ = useQuery({
    queryKey: ["area-filter-hierarchy"],
    queryFn: () => getHierarchy({}),
    staleTime: QUERY_STALE_REFERENCE,
    gcTime: QUERY_GC_REFERENCE,
  });
  const hierData = hierQ.data;
  // useMemo because the `?? []` created a new array on every render, and
  // `hierarchy` is a dependency of the `stores` useMemo, which therefore
  // always recalculated.
  const hierarchy = useMemo(() => hierData?.hierarchy ?? [], [hierData]);
  const opts = hierData;

  const baseDateIso = dateTo || opts?.latestDate || undefined;
  // useCallback so it can be a dependency of the `products` useMemo without
  // recreating the function (and invalidating the memo) on every render.
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

  const ready =
    !!dateFrom &&
    !!dateTo &&
    fStores.length > 0 &&
    (savedComposition ? fProducts.length > 0 : fDeptos.length > 0);

  const productOptionsQ = useQuery({
    queryKey: ["area-product-options", fStores, fDeptos, fSecoes, fGrupos, fSubgrupos],
    queryFn: () =>
      getProductOptions({
        data: {
          stores: fStores,
          deptos: fDeptos,
          secoes: fSecoes,
          grupos: fGrupos,
          subgrupos: fSubgrupos,
        },
      }),
    enabled: ready,
    staleTime: QUERY_STALE_REFERENCE,
    gcTime: QUERY_GC_REFERENCE,
  });
  const productOptions = useMemo(
    () =>
      (productOptionsQ.data ?? []).map((product) => ({
        value: product.prodCode,
        label: `PLU ${product.prodCode} · ${product.prodName}`,
      })),
    [productOptionsQ.data],
  );
  const productSelectionValid =
    savedComposition !== undefined ||
    fProducts.length === 0 ||
    productOptionsQ.isError ||
    (productOptionsQ.isSuccess &&
      fProducts.every((code) => productOptions.some((option) => option.value === code)));

  useEffect(() => {
    if (savedComposition || !productOptionsQ.isSuccess || !fProducts.length) return;
    const available = new Set(productOptions.map((option) => option.value));
    const validProducts = fProducts.filter((code) => available.has(code));
    if (validProducts.length !== fProducts.length) setProducts(validProducts);
    // Product selections are reconciled only after the complete option request succeeds.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedComposition, productOptionsQ.isSuccess, productOptions, fProducts]);

  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<AreaSortKey>("val");
  const [sortAsc, setSortAsc] = useState(false);
  const [pageSize, setPageSize] = useState<(typeof PAGE_SIZE_OPTIONS)[number]>(DEFAULT_PAGE_SIZE);
  const [page, setPage] = useState(1);
  const sortDir: "asc" | "desc" = sortAsc ? "asc" : "desc";
  const analysisScopeKey = JSON.stringify([
    dateFrom,
    dateTo,
    fStores,
    fDeptos,
    fSecoes,
    fGrupos,
    fSubgrupos,
    fProducts,
    search,
  ]);

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
      fProducts,
    ],
    () => setPage(1),
  );

  const { data, isFetching, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["area-analysis", analysisScopeKey, page, pageSize, sortKey, sortDir],
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
          products: fProducts,
          page,
          pageSize,
          search,
          sortBy: sortKey,
          sortDir,
        },
      }),
    enabled: ready && productSelectionValid,
    placeholderData: (previousData, previousQuery) =>
      previousQuery?.queryKey[1] === analysisScopeKey ? previousData : undefined,
    staleTime: QUERY_STALE_CORE,
    retry: 1,
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
  if (fProducts.length === 1) {
    pathParts.push(
      productOptions.find((option) => option.value === fProducts[0])?.label ?? fProducts[0],
    );
  } else if (fProducts.length > 1) pathParts.push(`${fProducts.length} produtos`);

  return {
    af,
    setStores,
    setDeptos,
    setSecoes,
    setGrupos,
    setSubgrupos,
    setProducts,
    setRange,
    dateFrom,
    dateTo,
    fStores,
    fDeptos,
    fSecoes,
    fGrupos,
    fSubgrupos,
    fProducts,
    productOptions,
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
