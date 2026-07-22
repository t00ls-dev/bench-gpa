import { useMemo } from "react";
import { CalendarRange, CalendarCheck, CalendarX, Rows3, AlertTriangle } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { fmtBRShort, fmtInt } from "@/lib/utils";
import type { ImportRecord } from "@/components/import-history";

const DAY_MS = 86_400_000;

function toUTC(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

function isoOf(t: number): string {
  const d = new Date(t);
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${d.getUTCFullYear()}-${mm}-${dd}`;
}

function Tile({
  icon: Icon,
  label,
  value,
  alert,
}: {
  icon: typeof CalendarRange;
  label: string;
  value: string;
  alert?: boolean;
}) {
  return (
    <div className="rounded-lg border border-border p-3">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className={`size-3.5 ${alert ? "text-destructive" : ""}`} />
        {label}
      </div>
      <div className={`mt-1 font-display text-lg font-semibold ${alert ? "text-destructive" : ""}`}>
        {value}
      </div>
    </div>
  );
}

export function DataCoverage({
  dates,
  isLoading,
}: {
  dates: ImportRecord[] | undefined;
  isLoading?: boolean;
}) {
  const stats = useMemo(() => {
    if (!dates || dates.length === 0) return null;
    const present = new Set(dates.map((d) => d.sale_date));
    const times = dates.map((d) => toUTC(d.sale_date));
    const min = Math.min(...times);
    const max = Math.max(...times);
    const spanDays = Math.round((max - min) / DAY_MS) + 1;
    const gaps: string[] = [];
    for (let t = min; t <= max; t += DAY_MS) {
      if (!present.has(isoOf(t))) gaps.push(isoOf(t));
    }
    const totalRows = dates.reduce((acc, d) => acc + d.row_count, 0);
    return {
      min: isoOf(min),
      max: isoOf(max),
      daysWithData: dates.length,
      spanDays,
      gaps,
      totalRows,
    };
  }, [dates]);

  if (isLoading) {
    return (
      <div className="kpi-card space-y-3">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="kpi-card">
        <p className="text-sm text-muted-foreground">Nenhuma data importada ainda.</p>
      </div>
    );
  }

  return (
    <div className="kpi-card space-y-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile
          icon={CalendarRange}
          label="Período coberto"
          value={`${fmtBRShort(stats.min)} – ${fmtBRShort(stats.max)}`}
        />
        <Tile icon={CalendarCheck} label="Dias com dados" value={fmtInt(stats.daysWithData)} />
        <Tile
          icon={CalendarX}
          label="Dias faltando"
          value={fmtInt(stats.gaps.length)}
          alert={stats.gaps.length > 0}
        />
        <Tile icon={Rows3} label="Linhas importadas" value={fmtInt(stats.totalRows)} />
      </div>

      {stats.gaps.length > 0 && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-xs">
          <p className="flex items-center gap-1.5 font-medium text-destructive">
            <AlertTriangle className="size-3.5 shrink-0" />
            {stats.gaps.length === 1
              ? "1 dia sem dados no intervalo:"
              : `${stats.gaps.length} dias sem dados no intervalo (de ${stats.spanDays} dias):`}
          </p>
          <p className="mt-1.5 text-muted-foreground">
            {stats.gaps
              .slice(0, 12)
              .map((g) => fmtBRShort(g))
              .join(" · ")}
            {stats.gaps.length > 12 && ` · +${stats.gaps.length - 12}`}
          </p>
        </div>
      )}
    </div>
  );
}
