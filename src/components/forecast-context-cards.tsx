import { KpiCard } from "@/components/kpi-card";

function formatTargetDate(targetDate: string | undefined) {
  if (!targetDate) return "Selecione";
  const [year, month, day] = targetDate.split("-");
  if (!year || !month || !day) return targetDate;
  return `${day}/${month}/${year}`;
}

export function ForecastContextCards({
  storeCode,
  targetDate,
  secao,
}: {
  storeCode: string | undefined;
  targetDate: string | undefined;
  secao: string | undefined;
}) {
  return (
    <section className="mb-4 space-y-3">
      <div>
        <h2 className="font-display text-lg font-semibold">Contexto da previsão</h2>
        <p className="text-sm text-muted-foreground">
          A previsão só abre depois de escolher Loja, Dia e Seção.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <KpiCard
          label="Loja"
          value={storeCode ?? "Selecione"}
          hint={storeCode ? "Filtro ativo" : "Escolha uma loja"}
        />
        <KpiCard
          label="Dia"
          value={formatTargetDate(targetDate)}
          hint={targetDate ? "Data da projeção" : "Escolha o dia"}
        />
        <KpiCard
          label="Seção"
          value={secao ?? "Selecione"}
          hint={secao ? "Filtro ativo" : "Escolha a seção"}
        />
      </div>
    </section>
  );
}
