import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fmtBRShort, fmtDT } from "@/lib/utils";

interface ImportRecord { sale_date: string; row_count: number; imported_at: string }

interface Props {
  records: ImportRecord[];
}

const MONTHS = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const WD = ["D", "S", "T", "Q", "Q", "S", "S"];

export function ImportCalendar({ records }: Props) {
  const byDate = useMemo(() => {
    const m = new Map<string, ImportRecord>();
    for (const r of records) m.set(r.sale_date, r);
    return m;
  }, [records]);

  const latestDate = useMemo(() => {
    if (records.length === 0) return null;
    return [...records].sort((a, b) => (a.sale_date < b.sale_date ? 1 : -1))[0].sale_date;
  }, [records]);

  const initialMonth = useMemo(() => {
    const ref = latestDate ? new Date(latestDate + "T00:00:00") : new Date();
    return { y: ref.getFullYear(), m: ref.getMonth() };
  }, [latestDate]);

  const [view, setView] = useState(initialMonth);
  const [selected, setSelected] = useState<string | null>(latestDate);

  const daysInMonth = new Date(view.y, view.m + 1, 0).getDate();
  const firstWd = new Date(view.y, view.m, 1).getDay();
  const cells: (string | null)[] = [];
  for (let i = 0; i < firstWd; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    const iso = `${view.y}-${String(view.m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    cells.push(iso);
  }
  while (cells.length % 7 !== 0) cells.push(null);

  const today = new Date();
  const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  const prevMonth = () => setView((v) => v.m === 0 ? { y: v.y - 1, m: 11 } : { y: v.y, m: v.m - 1 });
  const nextMonth = () => setView((v) => v.m === 11 ? { y: v.y + 1, m: 0 } : { y: v.y, m: v.m + 1 });

  const selectedRecord = selected ? byDate.get(selected) : null;

  return (
    <div className="grid gap-4 md:grid-cols-[1fr_280px]">
      <div>
        <div className="mb-3 flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={prevMonth}><ChevronLeft className="size-4" /></Button>
          <div className="font-display text-sm font-semibold">{MONTHS[view.m]} {view.y}</div>
          <Button variant="ghost" size="sm" onClick={nextMonth}><ChevronRight className="size-4" /></Button>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-semibold text-muted-foreground">
          {WD.map((w, i) => <div key={i} className="py-1">{w}</div>)}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {cells.map((iso, i) => {
            if (!iso) return <div key={i} className="aspect-square" />;
            const rec = byDate.get(iso);
            const isLatest = iso === latestDate;
            const isFuture = iso > todayIso;
            const isSel = iso === selected;
            const day = parseInt(iso.slice(-2), 10);
            return (
              <button
                key={i}
                onClick={() => rec && setSelected(iso)}
                disabled={!rec}
                className={[
                  "aspect-square rounded-md border text-xs font-medium transition relative",
                  rec
                    ? isLatest
                      ? "border-primary bg-primary text-primary-foreground shadow-sm"
                      : "border-success/30 bg-success/10 text-success hover:bg-success/20 cursor-pointer"
                    : isFuture
                      ? "border-dashed border-border bg-background text-muted-foreground/40"
                      : "border-dashed border-warning/30 bg-warning/10 text-warning",
                  isSel && !isLatest ? "ring-2 ring-primary" : "",
                ].join(" ")}
                title={rec ? `${fmtBRShort(iso)} : ${rec.row_count.toLocaleString("pt-BR")} linhas` : `${fmtBRShort(iso)} : não importado`}
              >
                {day}
              </button>
            );
          })}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1"><span className="inline-block size-3 rounded border border-primary bg-primary" /> Mais recente</span>
          <span className="flex items-center gap-1"><span className="inline-block size-3 rounded border border-success/30 bg-success/10" /> Importado</span>
          <span className="flex items-center gap-1"><span className="inline-block size-3 rounded border border-dashed border-warning/30 bg-warning/10" /> Ausente</span>
        </div>
      </div>

      <aside className="rounded-md border bg-muted/30 p-3">
        {selectedRecord ? (
          <div>
            <div className="text-xs text-muted-foreground">Detalhes da importação</div>
            <div className="mt-1 font-display text-base font-semibold">{fmtBRShort(selectedRecord.sale_date)}</div>
            <dl className="mt-3 space-y-1.5 text-xs">
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Linhas</dt>
                <dd className="font-medium">{selectedRecord.row_count.toLocaleString("pt-BR")}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Importado em</dt>
                <dd className="font-medium text-right">{fmtDT(selectedRecord.imported_at)}</dd>
              </div>
            </dl>
            <p className="mt-3 text-[11px] text-muted-foreground">
              Reimportar essa data substitui integralmente os dados anteriores.
            </p>
          </div>
        ) : selected ? (
          <div className="text-xs text-muted-foreground">Esta data ainda não foi importada.</div>
        ) : (
          <div className="text-xs text-muted-foreground">Clique em uma data importada para ver os detalhes.</div>
        )}
      </aside>
    </div>
  );
}
