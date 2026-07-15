import { cn } from "@/lib/utils";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";

interface Props {
  label: string;
  value: string;
  delta?: number | null;
  hint?: string;
}

export function KpiCard({ label, value, delta, hint }: Props) {
  const positive = (delta ?? 0) >= 0;
  return (
    <div className="kpi-card">
      <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="mt-2 flex items-end justify-between gap-3">
        <div className="num font-display text-2xl font-bold text-foreground md:text-3xl">
          {value}
        </div>
        {delta != null && isFinite(delta) && (
          <div
            className={cn(
              "flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold",
              positive ? "bg-success/15 text-success" : "bg-destructive/15 text-destructive",
            )}
          >
            {positive ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />}
            {Math.abs(delta * 100).toFixed(1)}%
          </div>
        )}
      </div>
      {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}

export function fmtBRL(n: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(n);
}

export function fmtInt(n: number) {
  return new Intl.NumberFormat("pt-BR").format(n);
}
