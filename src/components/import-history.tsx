import { useEffect, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Loader2,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import type { ImportHistoryRow } from "@/lib/upload.functions";
import { DEFAULT_PAGE_SIZE, PAGE_SIZE_OPTIONS, type ImportHistoryQuery } from "@/lib/schemas";
import { QUERY_STALE_CORE } from "@/lib/query-config";
import { cn, fmtBRShort, fmtDT, fmtInt } from "@/lib/utils";

const SEARCH_DEBOUNCE_MS = 250;
export type ImportRecord = ImportHistoryRow;
type ImportHistorySortKey = ImportHistoryQuery["sortBy"];

function SortHeader({
  label,
  sortKey,
  activeKey,
  sortDir,
  align = "left",
  onToggle,
}: {
  label: string;
  sortKey: ImportHistorySortKey;
  activeKey: ImportHistorySortKey;
  sortDir: ImportHistoryQuery["sortDir"];
  align?: "left" | "right";
  onToggle: (key: ImportHistorySortKey) => void;
}) {
  const active = sortKey === activeKey;
  const directionLabel = sortDir === "asc" ? "crescente" : "decrescente";
  return (
    <th
      className={cn("py-2", align === "right" && "text-right")}
      aria-sort={active ? (sortDir === "asc" ? "ascending" : "descending") : "none"}
    >
      <button
        type="button"
        onClick={() => onToggle(sortKey)}
        aria-label={`${label}${active ? ` (ordenado ${directionLabel})` : ""}`}
        className={cn(
          "inline-flex items-center gap-1 hover:text-foreground",
          align === "right" && "flex-row-reverse",
          active && "text-foreground",
        )}
      >
        {label}
        {active &&
          (sortDir === "asc" ? (
            <ChevronUp className="size-3" />
          ) : (
            <ChevronDown className="size-3" />
          ))}
      </button>
    </th>
  );
}

export function ImportHistory({
  historyFn,
  className = "mt-6",
}: {
  historyFn: (query: ImportHistoryQuery) => Promise<{
    records: ImportHistoryRow[];
    total: number;
    limit: number;
    offset: number;
  }>;
  className?: string;
}) {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [sortBy, setSortBy] = useState<ImportHistorySortKey>("sale_date");
  const [sortDir, setSortDir] = useState<ImportHistoryQuery["sortDir"]>("desc");
  const [pageSize, setPageSize] = useState<(typeof PAGE_SIZE_OPTIONS)[number]>(DEFAULT_PAGE_SIZE);
  const [page, setPage] = useState(1);
  const offset = (page - 1) * pageSize;

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedSearch(search), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timeout);
  }, [search]);

  const { data, isLoading, isFetching, isError, error, refetch } = useQuery({
    queryKey: ["import-history", debouncedSearch, sortBy, sortDir, pageSize, offset],
    queryFn: () => historyFn({ search: debouncedSearch, sortBy, sortDir, limit: pageSize, offset }),
    staleTime: QUERY_STALE_CORE,
    placeholderData: keepPreviousData,
    retry: false,
  });

  const total = data?.total ?? 0;
  const from = total === 0 ? 0 : offset + 1;
  const to = Math.min(offset + pageSize, total);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const changeSearch = (value: string) => {
    setSearch(value);
    setPage(1);
  };

  const toggleSort = (key: ImportHistorySortKey) => {
    setPage(1);
    if (sortBy === key) {
      setSortDir((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }
    setSortBy(key);
    setSortDir(key === "row_count" ? "desc" : "asc");
  };

  return (
    <div className={cn("kpi-card space-y-3", className)}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h2 className="font-display text-base font-semibold">Histórico de importações</h2>
          {isFetching && !isLoading && (
            <span role="status">
              <Loader2 className="size-4 animate-spin text-muted-foreground" aria-hidden="true" />
              <span className="sr-only">Atualizando histórico</span>
            </span>
          )}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          disabled={isFetching}
          aria-label="Atualizar histórico"
        >
          <RefreshCw className={cn("size-4 sm:mr-1", isFetching && "animate-spin")} />
          <span className="hidden sm:inline">Atualizar</span>
        </Button>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="flex h-9 min-w-0 flex-1 items-center gap-1 rounded-md border bg-background px-2 sm:max-w-sm">
          <Search className="size-3.5 shrink-0 text-muted-foreground" />
          <Input
            placeholder="Buscar data, linhas ou atualização…"
            aria-label="Buscar no histórico de importações"
            value={search}
            onChange={(event) => changeSearch(event.target.value)}
            className="h-7 min-w-0 border-0 px-1 text-sm shadow-none focus-visible:ring-1 focus-visible:ring-ring"
          />
          {search && (
            <button
              type="button"
              aria-label="Limpar busca"
              onClick={() => changeSearch("")}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>
        <Select
          value={String(pageSize)}
          onValueChange={(value) => {
            setPageSize(Number(value) as (typeof PAGE_SIZE_OPTIONS)[number]);
            setPage(1);
          }}
        >
          <SelectTrigger className="h-9 w-full sm:w-[110px]">
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
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, index) => (
            <Skeleton key={index} className="h-9 w-full" />
          ))}
        </div>
      ) : isError ? (
        <p className="py-4 text-center text-sm text-destructive">
          {error instanceof Error ? error.message : "Erro ao carregar histórico"}
        </p>
      ) : !data || data.records.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted-foreground">
          {debouncedSearch ? "Nenhuma importação encontrada." : "Nenhuma data importada."}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
                <SortHeader
                  label="Data"
                  sortKey="sale_date"
                  activeKey={sortBy}
                  sortDir={sortDir}
                  onToggle={toggleSort}
                />
                <SortHeader
                  label="Linhas"
                  sortKey="row_count"
                  activeKey={sortBy}
                  sortDir={sortDir}
                  align="right"
                  onToggle={toggleSort}
                />
                <SortHeader
                  label="Atualizado"
                  sortKey="imported_at"
                  activeKey={sortBy}
                  sortDir={sortDir}
                  align="right"
                  onToggle={toggleSort}
                />
              </tr>
            </thead>
            <tbody>
              {data.records.map((record) => (
                <tr key={record.sale_date} className="border-b border-border/60">
                  <td className="py-2 font-medium">{fmtBRShort(record.sale_date)}</td>
                  <td className="num py-2 text-right">{fmtInt(record.row_count)}</td>
                  <td className="py-2 text-right text-xs text-muted-foreground">
                    {fmtDT(record.imported_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!isLoading && !isError && data && (
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-xs text-muted-foreground">
          <span>
            Exibindo {from}–{to} de {fmtInt(total)} importações
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              aria-label="Página anterior"
              onClick={() => setPage((current) => Math.max(1, current - 1))}
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
              onClick={() => setPage((current) => current + 1)}
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
