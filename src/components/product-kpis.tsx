import { Suspense, lazy } from "react";
import { KpiCard } from "@/components/kpi-card";
import { fmtBRL } from "@/lib/utils";
import { PaginatedHistory } from "@/components/paginated-history";
import { Skeleton } from "@/components/ui/skeleton";
import { fmtBRShort } from "@/lib/utils";

const ProductCharts = lazy(() =>
  import("@/components/product-charts").then((m) => ({ default: m.ProductCharts })),
);

interface SeriesPoint {
  date: string;
  val: number;
}

export function ProductKPIs({
  analysisData,
  avgSame,
  avgDaily,
  refWeekdayFull,
  refWeekdayPlural,
  refArticle,
  sameWeekdayDates,
  hideStoreComp,
}: {
  analysisData: {
    refValue?: number;
    refDate?: string;
    evolution?: SeriesPoint[];
    product?: {
      depto: string | null;
      secao: string | null;
      grupo: string | null;
      subgrupo: string | null;
    };
  } | null;
  avgSame: number;
  avgDaily: number;
  refWeekdayFull: string | null;
  refWeekdayPlural: string | null;
  refArticle: string;
  sameWeekdayDates: SeriesPoint[];
  hideStoreComp: boolean;
}) {
  if (!analysisData) return null;

  return (
    <>
      <section className="mt-6 grid gap-4 md:grid-cols-3">
        <KpiCard
          label="Venda na data referência"
          value={fmtBRL(analysisData.refValue ?? 0)}
          hint={
            analysisData.refDate
              ? `${refWeekdayFull} · ${fmtBRShort(analysisData.refDate)}`
              : undefined
          }
        />
        <KpiCard
          label={`Média de ${refWeekdayPlural?.toLowerCase() ?? "datas anteriores"}`}
          value={fmtBRL(avgSame)}
          delta={avgSame > 0 ? ((analysisData.refValue ?? 0) - avgSame) / avgSame : null}
          hint={`${refArticle} 4 ${refWeekdayPlural?.toLowerCase() ?? "datas"}`}
        />
        <KpiCard
          label="Média diária"
          value={fmtBRL(avgDaily)}
          delta={avgDaily > 0 ? ((analysisData.refValue ?? 0) - avgDaily) / avgDaily : null}
          hint="Últimos 28 dias"
        />
      </section>

      <Suspense
        fallback={
          <section className="mt-6 grid gap-4 lg:grid-cols-2">
            <div className="kpi-card">
              <Skeleton className="h-72 w-full rounded-lg" />
            </div>
            <div className="kpi-card">
              <Skeleton className="h-72 w-full rounded-lg" />
            </div>
          </section>
        }
      >
        <ProductCharts analysisData={analysisData} hideStoreComp={hideStoreComp} />
      </Suspense>

      <PaginatedHistory
        title={`${refArticle} ${refWeekdayPlural?.toLowerCase() ?? "datas"}`}
        rows={sameWeekdayDates}
      />

      <PaginatedHistory
        title="Histórico diário (últimos 28 dias)"
        rows={analysisData.evolution as SeriesPoint[]}
      />
    </>
  );
}
