import { KpiCard } from "@/components/kpi-card";
import { fmtBRL, fmtInt } from "@/lib/utils";

export function AreaKpiCards({
  total,
  plusTotal,
  plusWithSale,
  noSale,
  avgPerPlu,
}: {
  total: number;
  plusTotal: number;
  plusWithSale: number;
  noSale: number;
  avgPerPlu: number;
}) {
  return (
    <section className="mb-4 grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
      <KpiCard label="Venda Total" value={fmtBRL(total)} />
      <KpiCard label="PLUs (área)" value={fmtInt(plusTotal)} hint="já venderam no histórico" />
      <KpiCard label="PLUs com venda" value={fmtInt(plusWithSale)} hint="no período" />
      <KpiCard label="PLUs sem venda" value={fmtInt(noSale)} hint="zerados no período" />
      <KpiCard label="Venda média por PLU" value={fmtBRL(avgPerPlu)} hint="entre os que venderam" />
    </section>
  );
}
