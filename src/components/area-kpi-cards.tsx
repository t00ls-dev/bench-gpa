import { KpiCard, fmtBRL, fmtInt } from "@/components/kpi-card";

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
      <KpiCard label="PLUs (área)" value={fmtInt(plusTotal)} />
      <KpiCard label="PLUs com venda" value={fmtInt(plusWithSale)} />
      <KpiCard label="PLUs sem venda" value={fmtInt(noSale)} />
      <KpiCard label="Venda média por PLU" value={fmtBRL(avgPerPlu)} />
    </section>
  );
}
