import { useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  FileText,
  Loader2,
  Search,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  X,
} from "lucide-react";
import { fmtBRL, fmtInt } from "@/lib/utils";
import { DEFAULT_PAGE_SIZE, PAGE_SIZE_OPTIONS } from "@/lib/schemas";
import type { ProductionForecastProduct, ProductionSecaoForecast } from "@/lib/api-types";
import { computeVisibleSecoes } from "@/lib/production-filter";

type SortKey = "prodCode" | "prodName" | "forecastMin" | "forecastVal" | "forecastMax";

function SortButton({
  label,
  sortKey,
  activeKey,
  ascending,
  onToggle,
  align = "left",
}: {
  label: string;
  sortKey: SortKey;
  activeKey: SortKey;
  ascending: boolean;
  onToggle: (key: SortKey) => void;
  align?: "left" | "right";
}) {
  const active = sortKey === activeKey;
  return (
    <div className={`py-2 px-3 ${align === "right" ? "text-right" : ""}`}>
      <button
        type="button"
        onClick={() => onToggle(sortKey)}
        aria-pressed={active}
        aria-label={`${label}${active ? ` (ordenado ${ascending ? "crescente" : "decrescente"})` : ""}`}
        className={`inline-flex items-center gap-1 hover:text-foreground ${align === "right" ? "flex-row-reverse" : ""} ${active ? "text-foreground" : ""}`}
      >
        {label}
        {active &&
          (ascending ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />)}
      </button>
    </div>
  );
}

function compareProducts(a: ProductionForecastProduct, b: ProductionForecastProduct, key: SortKey) {
  if (key === "prodCode" || key === "prodName") {
    return (key === "prodCode" ? a.prodCode : a.prodName).localeCompare(
      key === "prodCode" ? b.prodCode : b.prodName,
      "pt-BR",
      { numeric: key === "prodCode" },
    );
  }
  return a[key] - b[key];
}

export function ProductionTable({
  secoes,
  isFetching,
  productFilter,
  subgrupoFilter,
  onExportPDF,
  pdfLoading,
  pdfElapsed,
}: {
  secoes: ProductionSecaoForecast[];
  isFetching: boolean;
  productFilter?: string[];
  subgrupoFilter?: string[];
  onExportPDF?: (products: ProductionForecastProduct[]) => void;
  pdfLoading?: boolean;
  pdfElapsed?: number;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [search, setSearch] = useState("");
  const [pageSize, setPageSize] = useState<(typeof PAGE_SIZE_OPTIONS)[number]>(DEFAULT_PAGE_SIZE);
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState<SortKey>("prodName");
  const [sortAsc, setSortAsc] = useState(true);

  const { visibleSecoes } = useMemo(
    () => computeVisibleSecoes(secoes, productFilter, subgrupoFilter),
    [secoes, productFilter, subgrupoFilter],
  );
  const products = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase("pt-BR");
    return visibleSecoes
      .flatMap((section) => section.produtos)
      .filter(
        (product) =>
          !normalizedSearch ||
          product.prodCode.toLocaleLowerCase("pt-BR").includes(normalizedSearch) ||
          product.prodName.toLocaleLowerCase("pt-BR").includes(normalizedSearch),
      )
      .sort((a, b) => {
        const result = compareProducts(a, b, sortKey);
        return sortAsc ? result : -result;
      });
  }, [search, sortAsc, sortKey, visibleSecoes]);
  const totalRows = products.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
  const pagedProducts = useMemo(
    () => products.slice((page - 1) * pageSize, page * pageSize),
    [page, pageSize, products],
  );
  // TanStack Virtual exposes methods that the React Compiler cannot memoize safely.
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: pagedProducts.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 40,
    overscan: 10,
  });
  const virtualRows = virtualizer.getVirtualItems();
  const rows =
    virtualRows.length > 0
      ? virtualRows
      : pagedProducts.map((_, index) => ({ index, size: 40, start: index * 40 }));

  useEffect(() => {
    setPage(1);
  }, [pageSize, search, productFilter, subgrupoFilter, sortAsc, sortKey]);

  useEffect(() => {
    setPage((current) => Math.min(current, totalPages));
  }, [totalPages]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortAsc((current) => !current);
    } else {
      setSortKey(key);
      setSortAsc(true);
    }
  };

  return (
    <div className="kpi-card min-w-0">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 className="font-display text-lg font-semibold">Produtos da previsão</h2>
        {isFetching && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
        <div className="ml-auto flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center">
          <div className="flex h-9 items-center gap-1 rounded-md border bg-background px-2">
            <Search className="size-3.5 shrink-0 text-muted-foreground" />
            <Input
              placeholder="Buscar PLU ou descrição…"
              aria-label="Buscar PLU ou descrição"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="h-7 w-full border-0 px-1 text-sm shadow-none focus-visible:ring-1 focus-visible:ring-ring sm:w-56"
            />
            {search && (
              <button
                type="button"
                aria-label="Limpar busca"
                onClick={() => setSearch("")}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Select
              value={String(pageSize)}
              onValueChange={(value) =>
                setPageSize(Number(value) as (typeof PAGE_SIZE_OPTIONS)[number])
              }
            >
              <SelectTrigger className="h-9 flex-1 sm:w-[110px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAGE_SIZE_OPTIONS.map((size) => (
                  <SelectItem key={size} value={String(size)}>
                    {size} / página
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {onExportPDF && secoes.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => onExportPDF(products)}
                className="h-9 shrink-0"
                disabled={pdfLoading}
                title="Exporta o planejamento filtrado em PDF, com campo em branco pra anotar a quantidade produzida"
                aria-label="Exportar planejamento em PDF"
              >
                {pdfLoading ? (
                  <Loader2 className="mr-1.5 size-4 animate-spin" />
                ) : (
                  <FileText className="mr-1.5 size-4" />
                )}{" "}
                {pdfLoading ? `Gerando… ${pdfElapsed ?? 0}s` : "PDF"}
              </Button>
            )}
          </div>
        </div>
      </div>

      <div
        ref={scrollRef}
        className="overflow-auto -mx-3 px-3 sm:mx-0 sm:px-0"
        style={{ maxHeight: "70vh" }}
      >
        <div className="min-w-[640px] text-sm">
          <div className="grid grid-cols-[16%_44%_13%_13%_14%] border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
            <SortButton
              label="PLU"
              sortKey="prodCode"
              activeKey={sortKey}
              ascending={sortAsc}
              onToggle={toggleSort}
            />
            <SortButton
              label="Produto"
              sortKey="prodName"
              activeKey={sortKey}
              ascending={sortAsc}
              onToggle={toggleSort}
            />
            <SortButton
              label="Mín"
              sortKey="forecastMin"
              activeKey={sortKey}
              ascending={sortAsc}
              onToggle={toggleSort}
              align="right"
            />
            <SortButton
              label="Méd"
              sortKey="forecastVal"
              activeKey={sortKey}
              ascending={sortAsc}
              onToggle={toggleSort}
              align="right"
            />
            <SortButton
              label="Máx"
              sortKey="forecastMax"
              activeKey={sortKey}
              ascending={sortAsc}
              onToggle={toggleSort}
              align="right"
            />
          </div>
          <div style={{ height: `${virtualizer.getTotalSize()}px`, position: "relative" }}>
            {rows.map((virtualRow) => {
              const product = pagedProducts[virtualRow.index];
              if (!product) return null;
              return (
                <div
                  key={product.prodCode}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    height: `${virtualRow.size}px`,
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                  className="grid grid-cols-[16%_44%_13%_13%_14%] border-b border-border/60 hover:bg-muted/40"
                  title={`PLU ${product.prodCode} · ${product.prodName}`}
                >
                  <div className="truncate self-center font-mono text-xs pl-3">
                    {product.prodCode}
                  </div>
                  <div className="truncate self-center">{product.prodName}</div>
                  <div className="num self-center whitespace-nowrap text-right pr-3">
                    {fmtBRL(product.forecastMin)}
                  </div>
                  <div className="num self-center whitespace-nowrap text-right font-medium pr-3">
                    {fmtBRL(product.forecastVal)}
                  </div>
                  <div className="num self-center whitespace-nowrap text-right pr-3">
                    {fmtBRL(product.forecastMax)}
                  </div>
                </div>
              );
            })}
            {products.length === 0 && !isFetching && (
              <div className="py-8 text-center text-sm text-muted-foreground">
                {secoes.length === 0
                  ? "Nenhuma seção de Perecíveis encontrada para esta loja."
                  : "Nenhum produto encontrado."}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <div>
          Exibindo {totalRows === 0 ? 0 : (page - 1) * pageSize + 1}–
          {Math.min(page * pageSize, totalRows)} de {fmtInt(totalRows)} produtos
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            aria-label="Página anterior"
            onClick={() => setPage(page - 1)}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <span>
            Página {page} de {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            aria-label="Próxima página"
            onClick={() => setPage(page + 1)}
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
