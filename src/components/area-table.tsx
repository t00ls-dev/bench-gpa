import { useCallback, useRef } from "react";
import { useNavigate } from "@tanstack/react-router";
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
import { fmtBRL, fmtInt } from "@/lib/utils";
import { PAGE_SIZE_OPTIONS } from "@/lib/schemas";
import {
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  FileText,
  Loader2,
  Search,
  X,
} from "lucide-react";

type Product = {
  prod_code: string;
  prod_name: string;
  depto: string | null;
  secao: string | null;
  grupo: string | null;
  subgrupo: string | null;
  val: number;
  lastSaleDate: string | null;
};

type SortKey = "prod_code" | "prod_name" | "val" | "daysSince";

function SortBtn({
  label,
  k,
  sortKey,
  sortAsc,
  toggle,
  align = "left",
  hint,
}: {
  label: string;
  k: SortKey;
  sortKey: SortKey;
  sortAsc: boolean;
  toggle: (k: SortKey) => void;
  align?: "left" | "right";
  hint?: string;
}) {
  const active = sortKey === k;
  return (
    <div className={`py-2 px-3 ${align === "right" ? "text-right" : ""}`}>
      <button
        onClick={() => toggle(k)}
        title={hint}
        aria-pressed={active}
        aria-label={`${label}${active ? ` (ordenado ${sortAsc ? "crescente" : "decrescente"})` : ""}`}
        className={`inline-flex items-center gap-1 hover:text-foreground ${align === "right" ? "flex-row-reverse" : ""} ${active ? "text-foreground" : ""}`}
      >
        {label}
        {active &&
          (sortAsc ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />)}
      </button>
    </div>
  );
}

export function AreaTable({
  products,
  totalRows,
  page,
  totalPages,
  pageSize,
  search,
  isFetching,
  baseDateIso,
  storeCode,
  sortKey,
  sortAsc,
  daysSinceLabel,
  onSearchChange,
  onClearSearch,
  onPageSizeChange,
  onPageChange,
  onSortToggle,
  onExportPDF,
  pdfLoading,
  pdfElapsed,
}: {
  products: Product[];
  totalRows: number;
  page: number;
  totalPages: number;
  pageSize: number;
  search: string;
  isFetching: boolean;
  baseDateIso?: string;
  storeCode?: string | null;
  sortKey: SortKey;
  sortAsc: boolean;
  daysSinceLabel: (iso: string | null) => string;
  onSearchChange: (v: string) => void;
  onClearSearch: () => void;
  onPageSizeChange: (v: number) => void;
  onPageChange: (p: number) => void;
  onSortToggle: (k: SortKey) => void;
  onExportPDF: () => void;
  pdfLoading: boolean;
  pdfElapsed: number;
}) {
  const navigate = useNavigate();
  const scrollRef = useRef<HTMLDivElement>(null);

  const openProduct = useCallback(
    (code: string) => {
      navigate({ to: "/produto", search: { plu: code, store: storeCode ?? undefined } });
    },
    [navigate, storeCode],
  );

  const virtualizer = useVirtualizer({
    count: products.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 40,
    overscan: 10,
  });

  return (
    <div className="kpi-card min-w-0">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 className="font-display text-lg font-semibold">Produtos da área</h2>
        {isFetching && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
        <div className="ml-auto flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center">
          <div className="flex h-9 items-center gap-1 rounded-md border bg-background px-2">
            <Search className="size-3.5 text-muted-foreground shrink-0" />
            <Input
              placeholder="Buscar PLU ou descrição…"
              aria-label="Buscar PLU ou descrição"
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              className="h-7 w-full border-0 px-1 text-sm shadow-none focus-visible:ring-1 focus-visible:ring-ring sm:w-56"
            />
            {search && (
              <button
                type="button"
                aria-label="Limpar busca"
                onClick={onClearSearch}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>
          {/* Seletor de página e botão de PDF agrupados, pra sempre quebrarem
              juntos: sem isso o PDF ficava sozinho numa linha própria no
              celular, com bastante espaço vazio ao lado. */}
          <div className="flex items-center gap-2">
            <Select value={String(pageSize)} onValueChange={(v) => onPageSizeChange(Number(v))}>
              <SelectTrigger className="h-9 flex-1 sm:w-[110px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAGE_SIZE_OPTIONS.map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    {n} / página
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              onClick={onExportPDF}
              className="h-9 shrink-0"
              disabled={pdfLoading}
              title="Exporta a lista de produtos filtrada em PDF"
              aria-label="Exportar lista de produtos filtrada em PDF"
            >
              {pdfLoading ? (
                <Loader2 className="mr-1.5 size-4 animate-spin" />
              ) : (
                <FileText className="mr-1.5 size-4" />
              )}{" "}
              {pdfLoading ? `Gerando… ${pdfElapsed}s` : "PDF"}
            </Button>
          </div>
        </div>
      </div>

      <div
        ref={scrollRef}
        className="overflow-auto -mx-3 px-3 sm:mx-0 sm:px-0"
        style={{ maxHeight: "70vh" }}
      >
        <div className="min-w-[420px] text-sm">
          <div className="grid grid-cols-[18%_42%_20%_20%] border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
            <SortBtn
              label="PLU"
              k="prod_code"
              sortKey={sortKey}
              sortAsc={sortAsc}
              toggle={onSortToggle}
            />
            <SortBtn
              label="Produto"
              k="prod_name"
              sortKey={sortKey}
              sortAsc={sortAsc}
              toggle={onSortToggle}
            />
            <SortBtn
              label="Venda"
              k="val"
              sortKey={sortKey}
              sortAsc={sortAsc}
              toggle={onSortToggle}
              align="right"
            />
            <SortBtn
              label="Dias S/ Venda"
              k="daysSince"
              sortKey={sortKey}
              sortAsc={sortAsc}
              toggle={onSortToggle}
              align="right"
              hint={`Referência: ${baseDateIso ?? "-"}`}
            />
          </div>
          <div style={{ height: `${virtualizer.getTotalSize()}px`, position: "relative" }}>
            {virtualizer.getVirtualItems().map((virtualRow) => {
              const p = products[virtualRow.index];
              if (!p) return null;
              const noSaleRow = p.val === 0;
              return (
                <div
                  key={p.prod_code}
                  onClick={() => openProduct(p.prod_code)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      openProduct(p.prod_code);
                    }
                  }}
                  tabIndex={0}
                  role="button"
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    height: `${virtualRow.size}px`,
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                  className={`grid grid-cols-[18%_42%_20%_20%] cursor-pointer border-b border-border/60 hover:bg-muted/40 ${noSaleRow ? "bg-warning/10" : ""}`}
                  title="Abrir Análise de Produto"
                >
                  <div className="truncate self-center font-mono text-xs pl-3">{p.prod_code}</div>
                  <div className="truncate self-center">{p.prod_name}</div>
                  <div className="num text-right self-center whitespace-nowrap font-medium pr-3">
                    {fmtBRL(p.val)}
                  </div>
                  <div className="num text-right self-center whitespace-nowrap text-muted-foreground pr-3">
                    {daysSinceLabel(p.lastSaleDate)}
                  </div>
                </div>
              );
            })}
            {products.length === 0 && !isFetching && (
              <div className="py-8 text-center text-sm text-muted-foreground">
                Nenhum produto encontrado.
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
            onClick={() => onPageChange(page - 1)}
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
            onClick={() => onPageChange(page + 1)}
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        Linhas em amarelo indicam produtos sem venda no período. Clique em uma linha para abrir a
        Análise de Produto.
      </p>
    </div>
  );
}
