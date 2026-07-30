import { useState, useEffect, useRef, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { searchProducts, getProductAnalysis, getProductByCode } from "@/lib/product.functions";
import { getStores } from "@/lib/dashboard.functions";
import { QUERY_STALE_REFERENCE, QUERY_STALE_CORE } from "@/lib/query-config";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { MultiSelect } from "@/components/multi-select";
import { ProductSearch } from "@/components/product-search";
import { ProductKPIs } from "@/components/product-kpis";
import { Skeleton } from "@/components/ui/skeleton";
import { fmtBRL } from "@/lib/utils";
import { Package, FileText, Loader2 } from "lucide-react";
import { fmtBRShort } from "@/lib/utils";
import { openPdfBlob } from "@/lib/export-pdf";
import { Route } from "./produto";

const SEARCH_DEBOUNCE_MS = 250;

const WEEKDAYS_FULL = [
  "Domingo",
  "Segunda-feira",
  "Terça-feira",
  "Quarta-feira",
  "Quinta-feira",
  "Sexta-feira",
  "Sábado",
];
const WEEKDAYS_PLURAL = [
  "Domingos",
  "Segundas-feiras",
  "Terças-feiras",
  "Quartas-feiras",
  "Quintas-feiras",
  "Sextas-feiras",
  "Sábados",
];
const WEEKDAY_IS_MASC = [true, false, false, false, false, false, true];

interface SeriesPoint {
  date: string;
  val: number;
}

function ProdutoPage() {
  const { plu, store } = Route.useSearch();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<{ prod_code: string; prod_name: string } | null>(null);
  const [debounced, setDebounced] = useState("");
  const [storeCodes, setStoreCodes] = useState<string[]>(store ? [store] : []);
  const tRef = useRef<number | null>(null);

  const getProductByCodeFn = useServerFn(getProductByCode);

  const { data: productByCode, isFetching: fetchingProductByCode } = useQuery({
    queryKey: ["product-by-code", plu],
    queryFn: () => getProductByCodeFn({ data: { prodCode: plu! } }),
    enabled: !!plu && !selected,
    staleTime: QUERY_STALE_REFERENCE,
  });

  useEffect(() => {
    if (plu && productByCode) setSelected(productByCode);
    else if (plu && !fetchingProductByCode && !productByCode)
      setSelected({ prod_code: plu, prod_name: plu });
  }, [plu, productByCode, fetchingProductByCode]);

  useEffect(() => {
    if (tRef.current) window.clearTimeout(tRef.current);
    // 250ms: rápido o bastante para não atrasar a busca, alto o bastante para
    // não disparar uma query por tecla enquanto o usuário ainda digita.
    tRef.current = window.setTimeout(() => setDebounced(query), SEARCH_DEBOUNCE_MS);
  }, [query]);

  const search = useServerFn(searchProducts);
  const analysis = useServerFn(getProductAnalysis);
  const getStoresFn = useServerFn(getStores);

  const { data: stores = [] } = useQuery({
    queryKey: ["stores-all"],
    queryFn: () => getStoresFn({}),
    staleTime: QUERY_STALE_REFERENCE,
  });

  const { data: suggestions, isFetching: searchFetching } = useQuery({
    queryKey: ["product-search", debounced],
    queryFn: () => search({ data: { q: debounced } }),
    enabled: debounced.length >= 3 && !selected,
  });

  const { data: analysisData, isFetching: analysisLoading } = useQuery({
    queryKey: ["product-analysis", selected?.prod_code, storeCodes],
    queryFn: () =>
      analysis({
        data: {
          prodCode: selected!.prod_code,
          storeCodes,
          referenceDate: null,
        },
      }),
    enabled: !!selected,
    staleTime: QUERY_STALE_CORE,
    placeholderData: (prev) => prev,
  });

  // byStore (result set 3 da proc) sempre traz TODAS as lojas — filtrar aqui
  // pro gráfico de comparação refletir só o subconjunto escolhido, sem outra
  // ida ao banco. Com 0 ou 1 loja selecionada não filtra (0 = todas; com 1 o
  // gráfico fica escondido via hideStoreComp, então o filtro não importa).
  const filteredAnalysisData = useMemo(() => {
    if (!analysisData || storeCodes.length < 2) return analysisData;
    return {
      ...analysisData,
      byStore: (analysisData.byStore ?? []).filter((s) => storeCodes.includes(s.code)),
    };
  }, [analysisData, storeCodes]);

  const refWeekdayIdx = analysisData?.refDate
    ? new Date(analysisData.refDate + "T00:00:00Z").getUTCDay()
    : null;
  const refWeekdayFull = refWeekdayIdx != null ? WEEKDAYS_FULL[refWeekdayIdx] : null;
  const refWeekdayPlural = refWeekdayIdx != null ? WEEKDAYS_PLURAL[refWeekdayIdx] : null;
  const refArticle =
    refWeekdayIdx != null ? (WEEKDAY_IS_MASC[refWeekdayIdx] ? "Últimos" : "Últimas") : "Últimas";

  // As últimas 4 datas do mesmo dia da semana anteriores à referência — vêm da
  // proc (result set lastFourSameWeekday), já excluindo a data de referência.
  const sameWeekdayDates = (analysisData?.lastFourSameWeekday ?? []) as SeriesPoint[];

  const avgSame = sameWeekdayDates.length
    ? sameWeekdayDates.reduce((a, b) => a + b.val, 0) / sameWeekdayDates.length
    : 0;
  const avgDaily = useMemo(() => {
    const ev = (analysisData?.evolution as SeriesPoint[] | undefined) ?? [];
    return ev.length ? ev.reduce((a, b) => a + b.val, 0) / ev.length : 0;
  }, [analysisData?.evolution]);

  const [pdfLoading, setPdfLoading] = useState(false);

  const openProductPdf = async () => {
    setPdfLoading(true);
    try {
      const jsPDF = (await import("jspdf")).default;
      const autoTable = (await import("jspdf-autotable")).default;
      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const mX = 10;
      let y = 12;

      const pn = selected?.prod_name ?? "";
      const pc = selected?.prod_code ?? "";
      const storeLabel =
        storeCodes.length === 0
          ? "Todas as lojas"
          : storeCodes.length === 1
            ? (stores.find((s) => s.store_code === storeCodes[0])?.store_name ?? storeCodes[0])
            : `${storeCodes.length} lojas`;

      doc.setFont("helvetica", "bold");
      doc.setFontSize(14);
      doc.setTextColor(17, 17, 17);
      doc.text("Análise de Produto", mX, y);
      y += 7;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(85, 85, 85);
      doc.text(pc + " — " + pn, mX, y);
      y += 4.5;
      doc.text("Loja: " + storeLabel, mX, y);
      y += 4;
      if (analysisData?.product) {
        const prod = analysisData.product;
        const hier: string[] = [];
        if (prod.depto) hier.push(prod.depto);
        if (prod.secao) hier.push(prod.secao);
        if (prod.grupo) hier.push(prod.grupo);
        if (prod.subgrupo) hier.push(prod.subgrupo);
        if (hier.length) doc.text(hier.join(" › "), mX, y);
        y += 4;
      }
      if (analysisData?.refDate)
        doc.text("Data referência: " + fmtBRShort(analysisData.refDate), mX, y);
      y += 6;

      if (analysisData) {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(10);
        doc.setTextColor(17, 17, 17);
        doc.text("Indicadores", mX, y);
        y += 5;
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(85, 85, 85);
        doc.text("Venda referência: " + fmtBRL(analysisData.refValue ?? 0), mX, y);
        y += 4;
        doc.text("Média diária (28 dias): " + fmtBRL(avgDaily), mX, y);
        y += 4;
        if (refWeekdayFull)
          doc.text(
            "Média de " + (refWeekdayPlural?.toLowerCase() ?? "") + ": " + fmtBRL(avgSame),
            mX,
            y,
          );
        y += 6;
      }

      if (analysisData?.evolution?.length) {
        const ev = analysisData.evolution as Array<{ date: string; val: number }>;
        if (y > 250) {
          doc.addPage();
          y = 20;
        }
        autoTable(doc, {
          startY: y,
          margin: { left: mX, right: mX },
          head: [["Data", "Venda"]],
          body: ev
            .slice()
            .reverse()
            .map((e) => [fmtBRShort(e.date), fmtBRL(e.val)]),
          theme: "grid",
          styles: {
            font: "helvetica",
            fontSize: 8,
            cellPadding: 1.5,
            overflow: "hidden",
            valign: "middle",
            lineColor: [153, 153, 153],
            lineWidth: 0.1,
            textColor: [17, 17, 17],
          },
          headStyles: {
            fillColor: [238, 238, 255],
            textColor: [17, 17, 17],
            fontStyle: "bold",
            fontSize: 8,
            halign: "center",
          },
          columnStyles: { 0: { cellWidth: 60 }, 1: { cellWidth: 130, halign: "right" } },
        });
      }

      openPdfBlob(doc);
    } finally {
      setPdfLoading(false);
    }
  };

  const handleClear = () => {
    setQuery("");
    setSelected(null);
    setDebounced("");
  };
  const handleSelect = (s: { prod_code: string; prod_name: string }) => {
    setSelected(s);
    setQuery("");
  };

  return (
    <div>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold flex items-center gap-2">
            <Package className="size-7 text-primary shrink-0" /> Análise de Produto
          </h1>
          <p className="text-sm text-muted-foreground">
            Pesquise um produto para ver comparações entre lojas, evolução e benchmarks semanais.
          </p>
        </div>
        {selected && analysisData && (
          <Button
            variant="outline"
            size="sm"
            className="h-9"
            onClick={openProductPdf}
            disabled={pdfLoading}
          >
            {pdfLoading ? (
              <Loader2 className="mr-1.5 size-4 animate-spin" />
            ) : (
              <FileText className="mr-1.5 size-4" />
            )}
            PDF
          </Button>
        )}
      </header>

      <div className="kpi-card mb-4 min-w-0 overflow-hidden grid gap-3 md:grid-cols-2 [&>*]:min-w-0">
        <div>
          <Label className="text-xs">Loja</Label>
          <MultiSelect
            label="Todas as lojas"
            noun={{ one: "loja", other: "lojas" }}
            options={stores.map((s) => ({
              value: s.store_code,
              label: `${s.store_code} - ${s.store_name}`,
            }))}
            value={storeCodes}
            onChange={setStoreCodes}
          />
        </div>
      </div>

      <ProductSearch
        query={query}
        debounced={debounced}
        selected={selected}
        suggestions={suggestions}
        searchFetching={searchFetching}
        onQueryChange={(v) => {
          setQuery(v);
          setSelected(null);
        }}
        onSelect={handleSelect}
        onClear={handleClear}
        product={analysisData?.product}
      />

      {selected && analysisLoading && !analysisData && (
        <>
          <section className="mt-6 grid gap-4 md:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="kpi-card">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="mt-2 h-8 w-28" />
                <Skeleton className="mt-2 h-3 w-20" />
              </div>
            ))}
          </section>
          <section className="mt-6 grid gap-4 lg:grid-cols-2">
            {Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="kpi-card">
                <Skeleton className="h-5 w-48" />
                <Skeleton className="mt-2 h-3 w-64" />
                <Skeleton className="mt-4 h-72 w-full rounded-lg" />
              </div>
            ))}
          </section>
        </>
      )}

      {selected && !analysisLoading && analysisData && !analysisData.product && (
        <div className="kpi-card text-center py-10 mt-6">
          <p className="text-sm text-muted-foreground">
            Nenhum dado de venda encontrado para este produto no período disponível.
          </p>
        </div>
      )}

      {selected && analysisData && analysisData.product && (
        <ProductKPIs
          analysisData={{
            ...filteredAnalysisData,
            refDate: analysisData.refDate ?? undefined,
            product: analysisData.product ?? undefined,
          }}
          avgSame={avgSame}
          avgDaily={avgDaily}
          refWeekdayFull={refWeekdayFull}
          refWeekdayPlural={refWeekdayPlural}
          refArticle={refArticle}
          sameWeekdayDates={sameWeekdayDates}
          hideStoreComp={storeCodes.length === 1}
        />
      )}

      {!selected && fetchingProductByCode && (
        <div className="mt-12 flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Carregando produto…
        </div>
      )}
      {!selected && !fetchingProductByCode && (
        <div className="mt-12 text-center text-sm text-muted-foreground">
          Use a busca acima para começar.
        </div>
      )}
    </div>
  );
}

export default ProdutoPage;
