import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getImportedDates } from "@/lib/analytics.functions";
import { AlertTriangle, CheckCircle2, Clock } from "lucide-react";

function fmtDate(s: string) {
  const [y, m, d] = s.split("-");
  return `${d}/${m}/${y}`;
}
function fmtDateTime(iso: string) {
  const d = new Date(iso);
  return `${d.toLocaleDateString("pt-BR")} às ${d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
}
function todayIso() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}
function daysBetween(aIso: string, bIso: string) {
  const a = new Date(aIso + "T00:00:00").getTime();
  const b = new Date(bIso + "T00:00:00").getTime();
  return Math.round((b - a) / 86400000);
}

export function LastUpdateInfo({ compact = false }: { compact?: boolean }) {
  const fn = useServerFn(getImportedDates);
  const { data } = useQuery({
    queryKey: ["imported-dates-summary"],
    queryFn: () => fn(),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  if (!data || data.length === 0) {
    return (
      <div className="text-xs text-muted-foreground flex items-center gap-1.5">
        <Clock className="size-3.5" /> Nenhuma importação registrada.
      </div>
    );
  }

  const latestSale = [...data].sort((a, b) => (a.sale_date < b.sale_date ? 1 : -1))[0];
  const latestImport = [...data].sort((a, b) => (a.imported_at < b.imported_at ? 1 : -1))[0];

  const today = todayIso();
  const gap = daysBetween(latestSale.sale_date, today); // days between latest sale and today
  // Expected: yesterday's sales arrive today; so gap of 1 is normal.
  const stale = gap > 1;

  if (compact) {
    return (
      <div className="text-xs text-muted-foreground flex items-center gap-2">
        <Clock className="size-3.5" />
        Atualizado {fmtDateTime(latestImport.imported_at)} · Última venda {fmtDate(latestSale.sale_date)}
      </div>
    );
  }

  return (
    <div className={`flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md border px-3 py-2 text-xs ${
      stale ? "border-warning/30 bg-warning/10 text-warning" : "border-border bg-muted/40 text-muted-foreground"
    }`}>
      <span className="flex items-center gap-1.5">
        {stale ? <AlertTriangle className="size-3.5" /> : <CheckCircle2 className="size-3.5 text-success" />}
        <strong className="font-medium text-foreground">Dados atualizados em:</strong> {fmtDateTime(latestImport.imported_at)}
      </span>
      <span className="flex items-center gap-1.5">
        <strong className="font-medium text-foreground">Última venda disponível:</strong> {fmtDate(latestSale.sale_date)}
      </span>
      {stale ? (
        <span className="w-full text-warning">
          Existem dados mais recentes ainda não importados (há {gap} dias sem novas vendas).
        </span>
      ) : (
        <span className="w-full text-muted-foreground">
          As vendas do dia anterior podem ficar disponíveis apenas no dia seguinte.
        </span>
      )}
    </div>
  );
}
