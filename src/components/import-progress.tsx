import { Button } from "@/components/ui/button";
import { fmtBRShort, fmtInt } from "@/lib/utils";
import { FileSpreadsheet, CheckCircle2, AlertCircle, Loader2, Gauge, Clock } from "lucide-react";

interface FileEntry {
  file: File;
  saleDate: string;
  status: "pending" | "processing" | "done" | "error";
  totalLines?: number;
  errorMsg?: string;
}

export function ImportProgress({
  entries,
  busy,
  progressPct,
  speed,
  eta,
  processed,
  currentDate,
  onProcess,
  onCancel,
}: {
  entries: FileEntry[];
  busy: boolean;
  progressPct: number;
  speed: number;
  eta: number;
  processed: number;
  currentDate: string;
  onProcess: () => void;
  onCancel?: () => void;
}) {
  return (
    <div className="mt-4 kpi-card">
        <div className="mb-3 flex items-center justify-between">
        <div className="text-sm font-medium">{entries.length} arquivo(s) selecionado(s)</div>
        <div className="flex gap-2">
          {busy && onCancel && (
            <Button variant="outline" onClick={onCancel}>
              Cancelar
            </Button>
          )}
          <Button onClick={onProcess} disabled={busy}>
            {busy ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" /> Importando…
              </>
            ) : (
              "Iniciar importação"
            )}
          </Button>
        </div>
      </div>

      {busy && (
        <div className="mb-3 rounded-md border bg-muted/30 p-3">
          <div className="flex items-center gap-3 text-sm">
            <FileSpreadsheet className="size-4 shrink-0 text-primary" />
            <span className="truncate font-medium">
              {currentDate ? fmtBRShort(currentDate) : ""}
            </span>
          </div>
          <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all duration-300"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Gauge className="size-3" /> {fmtInt(speed)} Linhas/s
            </span>
            <span>·</span>
            <span className="flex items-center gap-1 whitespace-nowrap">
              <Clock className="size-3" /> ~{eta}s
            </span>
          </div>
        </div>
      )}

      <ul className="space-y-2">
        {entries.map((e, i) => (
          <li
            key={`${e.saleDate}-${i}`}
            className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm ${
              e.status === "processing"
                ? "bg-primary/5 ring-1 ring-primary/20"
                : e.status === "done"
                  ? "bg-success/10"
                  : e.status === "error"
                    ? "bg-destructive/5"
                    : "bg-muted/40"
            }`}
          >
            {e.status === "processing" ? (
              <Loader2 className="size-4 shrink-0 animate-spin text-primary" />
            ) : e.status === "done" ? (
              <CheckCircle2 className="size-4 shrink-0 text-success" />
            ) : e.status === "error" ? (
              <AlertCircle className="size-4 shrink-0 text-destructive" />
            ) : (
              <FileSpreadsheet className="size-4 shrink-0 text-muted-foreground" />
            )}
            <div className="flex-1 min-w-0">
              <span className="truncate font-medium">{fmtBRShort(e.saleDate)}</span>
            </div>
            <span className="ml-auto text-xs text-muted-foreground whitespace-nowrap shrink-0">
              {e.status === "processing"
                ? `${fmtInt(processed)} / ${fmtInt(e.totalLines ?? 0)} linhas`
                : e.status === "done"
                  ? "Concluído"
                  : e.status === "error" && e.errorMsg
                    ? "Erro"
                    : "Aguardando"}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
