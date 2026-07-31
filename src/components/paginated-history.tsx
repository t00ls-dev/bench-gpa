import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { fmtBRL, fmtInt } from "@/lib/utils";
import { fmtBRShort } from "@/lib/utils";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface SeriesPoint {
  date: string;
  val: number;
}

export function PaginatedHistory({ title, rows }: { title: string; rows: SeriesPoint[] }) {
  const sorted = useMemo(() => [...rows].sort((a, b) => (a.date < b.date ? 1 : -1)), [rows]);
  const PAGE = 10;
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE));
  const start = (page - 1) * PAGE;
  const slice = sorted.slice(start, start + PAGE);

  return (
    <section className="mt-6 kpi-card">
      <div className="mb-3 flex items-center justify-between gap-3 flex-wrap">
        <h2 className="font-display text-lg font-semibold">{title}</h2>
        <span className="text-xs text-muted-foreground">{fmtInt(sorted.length)} registro(s)</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
              <th className="py-2">Data</th>
              <th className="py-2 text-right">Venda</th>
            </tr>
          </thead>
          <tbody>
            {slice.map((d) => (
              <tr key={d.date} className="border-b border-border/60">
                <td className="py-2 whitespace-nowrap">{fmtBRShort(d.date)}</td>
                <td className="num py-2 text-right font-medium">{fmtBRL(d.val)}</td>
              </tr>
            ))}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={2} className="py-6 text-center text-xs text-muted-foreground">
                  Sem histórico disponível.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <div>
            Exibindo {start + 1}–{Math.min(start + PAGE, sorted.length)} de {fmtInt(sorted.length)}{" "}
            registros
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page === 1}
              aria-label="Página anterior"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              <ChevronLeft className="size-4" />
            </Button>
            <span>
              Página {page} de {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page === totalPages}
              aria-label="Próxima página"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
