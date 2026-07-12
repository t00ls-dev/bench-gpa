import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState, useRef, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { beginImport, insertSalesChunk, finalizeImport } from "@/lib/upload.functions";
import { purgeOldAggs } from "@/lib/admin.functions";
import { getImportedDates } from "@/lib/analytics.functions";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Upload, FileSpreadsheet, CheckCircle2, AlertCircle, Loader2, CalendarCheck, Clock, Gauge } from "lucide-react";
import { ImportCalendar } from "@/components/import-calendar";
import { AdminGate } from "@/components/admin-gate";
import { supabase } from "@/integrations/supabase/client";
import { fmtBRShort, fmtInt, fmtDT } from "@/lib/utils";
import { parseAnyWorkbook } from "@/lib/xlsx-parser";

const CHUNK_SIZE = 1000;
const MAX_FILE_SIZE = 50 * 1024 * 1024;
const MAX_TOTAL_ROWS = 500_000;

export const Route = createFileRoute("/_authenticated/upload")({
  beforeLoad: async () => {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) throw redirect({ to: "/auth" });
    const { data: isAdmin } = await supabase.rpc("has_role", {
      _user_id: u.user.id,
      _role: "admin",
    });
    if (isAdmin !== true) throw redirect({ to: "/" });
  },
  component: () => <AdminGate><UploadPage /></AdminGate>,
});


interface FileEntry {
  file: File;
  saleDate: string;
  status: "pending" | "processing" | "done" | "error";
  totalLines?: number;
  errorMsg?: string;
}

interface Result {
  filename: string;
  ok: boolean;
  message: string;
  date?: string;
  rows?: number;
}

function UploadPage() {
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [results, setResults] = useState<Result[]>([]);
  const [busy, setBusy] = useState(false);
  const [progressPct, setProgressPct] = useState(0);
  const [speed, setSpeed] = useState(0);
  const [eta, setEta] = useState(0);
  const [processed, setProcessed] = useState(0);
  const [currentDate, setCurrentDate] = useState("");
  const [confirmDialog, setConfirmDialog] = useState<{
    date: string;
    rowCount: number;
    importedAt: string;
    resolve: (v: boolean) => void;
  } | null>(null);
  const begin = useServerFn(beginImport);
  const insertChunk = useServerFn(insertSalesChunk);
  const finalize = useServerFn(finalizeImport);
  const importedDates = useServerFn(getImportedDates);
  const qc = useQueryClient();

  const { data: dates } = useQuery({ queryKey: ["imported-dates"], queryFn: () => importedDates(), staleTime: 5 * 60_000, gcTime: 30 * 60_000 });

  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const busyRef = useRef(false);

  const acquireWakeLock = useRef(async () => {
    try {
      if ('wakeLock' in navigator) {
        wakeLockRef.current = await navigator.wakeLock.request('screen');
      }
    } catch {
      /* browser may deny request — proceed without wake lock */
    }
  }).current;

  const releaseWakeLock = useRef(() => {
    wakeLockRef.current?.release();
    wakeLockRef.current = null;
  }).current;

  useEffect(() => {
    const handler = () => {
      if (document.visibilityState === 'visible' && busyRef.current) {
        acquireWakeLock();
      }
    };
    document.addEventListener('visibilitychange', handler);
    return () => {
      document.removeEventListener('visibilitychange', handler);
      releaseWakeLock();
    };
  }, [acquireWakeLock, releaseWakeLock]);

  const processFiles = async () => {
    if (entries.length === 0) return;
    busyRef.current = true;
    setBusy(true);
    await acquireWakeLock();
    setResults([]);
    setProgressPct(0);
    setSpeed(0);
    setEta(0);
    setProcessed(0);
    setCurrentDate("");
    const r: Result[] = [];

    const validEntries = entries.filter((e) => e.status !== "error");
    for (let fi = 0; fi < validEntries.length; fi++) {
      const entry = validEntries[fi];
      const startTime = Date.now();
      let totalLines = 0;
      setCurrentDate(entry.saleDate);
      setEntries((prev) => prev.map((e) =>
        e.file === entry.file
          ? { ...e, status: "processing" as const }
          : e,
      ));

      const f = entry.file;
      try {
        setProgressPct(0);
        setProcessed(0);
        const buf = await f.arrayBuffer();
        const parsed = parseAnyWorkbook(buf);

        totalLines = parsed.sales.length;
        if (totalLines > MAX_TOTAL_ROWS) {
          throw new Error(`Arquivo excede o limite de ${fmtInt(MAX_TOTAL_ROWS)} linhas (${fmtInt(totalLines)}).`);
        }
        if (totalLines === 0) {
          throw new Error("Nenhuma linha de venda encontrada no arquivo.");
        }

        const existing = dates?.find((d) => d.sale_date === parsed.sale_date);
        if (existing) {
          const ok = await new Promise<boolean>((resolve) => {
            setConfirmDialog({
              date: parsed.sale_date,
              rowCount: existing.row_count,
              importedAt: existing.imported_at,
              resolve,
            });
          });
          setConfirmDialog(null);
          if (!ok) throw new Error("Importação cancelada para este arquivo.");
        }

        setEntries((prev) => prev.map((e) =>
          e.file === entry.file
            ? { ...e, totalLines }
            : e,
        ));

        const batchId = crypto.randomUUID();
        setProgressPct(0);
        await begin({ data: { sale_date: parsed.sale_date, batch_id: batchId, total_rows: totalLines, stores: parsed.stores, products: parsed.products } });

        let i = 0;
        let done = 0;
        while (i < totalLines) {
          const chunk = parsed.sales.slice(i, i + CHUNK_SIZE);
          const elapsed = (Date.now() - startTime) / 1000;
          const rate = elapsed > 0 ? Math.round(done / elapsed) : 0;
          const rem = rate > 0 ? Math.round((totalLines - done) / rate) : 0;
          setSpeed(rate);
          setEta(rem);
          setProcessed(Math.min(i + CHUNK_SIZE, totalLines));
          setProgressPct(totalLines > 0 ? Math.round((done / totalLines) * 100) : 0);
          await insertChunk({ data: { sale_date: parsed.sale_date, batch_id: batchId, rows: chunk } });
          i += CHUNK_SIZE;
          done = i;
        }

        setProgressPct(100);
        await finalize({ data: { sale_date: parsed.sale_date, batch_id: batchId, row_count: totalLines } });

        try { await purgeOldAggs(); } catch {}

        r.push({ filename: f.name, ok: true, message: `${fmtInt(totalLines)} linhas`, date: parsed.sale_date, rows: totalLines });
        setEntries((prev) => prev.map((e) =>
          e.file === entry.file
            ? { ...e, status: "done" as const }
            : e,
        ));
      } catch (e: any) {
        r.push({ filename: f.name, ok: false, message: e?.message ?? "Erro desconhecido" });
        setEntries((prev) => prev.map((e) =>
          e.file === entry.file
            ? { ...e, status: "error" as const, errorMsg: e?.message ?? "Erro desconhecido" }
            : e,
        ));
      }
      setResults([...r]);
    }

    setProgressPct(0);
    setCurrentDate("");
    setBusy(false);
    busyRef.current = false;
    releaseWakeLock();
    qc.invalidateQueries({ queryKey: ["imported-dates"] });
    qc.invalidateQueries({ queryKey: ["filter-options"] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });

    const ok = r.filter((x) => x.ok).length;
    if (ok === r.length) toast.success(`${ok} arquivo(s) importado(s).`);
    else if (ok > 0) toast.warning(`${ok} de ${r.length} importados.`);
    else toast.error("Nenhum arquivo importado.");
  };

  return (
    <div className="mx-auto max-w-4xl">
      <header className="mb-6">
        <h1 className="font-display text-3xl font-bold flex items-center gap-2">
          <Upload className="size-7 text-primary shrink-0" /> Importar planilhas
        </h1>
        <p className="text-sm text-muted-foreground">
          Dados existentes na mesma data são substituídos integralmente.
        </p>
      </header>

      <label
        htmlFor="files"
        className="kpi-card flex cursor-pointer flex-col items-center justify-center border-2 border-dashed border-border bg-muted/30 py-10 text-center transition hover:border-primary/50 hover:bg-primary/5"
      >
        <Upload className="mb-3 size-8 text-muted-foreground" />
        <div className="font-medium">Arraste arquivos ou clique para selecionar</div>
        <div className="mt-1 text-xs text-muted-foreground">.xlsx, .xls (múltiplos arquivos, máx. 50 MB cada)</div>
        <input
          id="files" type="file" multiple accept=".xlsx,.xls"
          className="sr-only"
          onChange={async (e) => {
            const selected = Array.from(e.target.files ?? []);
            const oversized = selected.filter((f) => f.size > MAX_FILE_SIZE);
            if (oversized.length > 0) {
              toast.error(`${oversized.length} arquivo(s) excedem o limite de 50 MB.`);
            }
            const valid = selected.filter((f) => f.size <= MAX_FILE_SIZE);
            const parsed: FileEntry[] = [];
            let parseErrors = 0;
            for (const f of valid) {
              try {
                const buf = await f.arrayBuffer();
                const p = parseAnyWorkbook(buf);
                parsed.push({ file: f, saleDate: p.sale_date, status: "pending" });
              } catch (err: any) {
                parsed.push({ file: f, saleDate: "", status: "error", errorMsg: err?.message ?? "Erro ao ler arquivo" });
                parseErrors++;
              }
            }
            parsed.sort((a, b) => {
              if (a.status === "error" && b.status !== "error") return 1;
              if (b.status === "error" && a.status !== "error") return -1;
              return b.saleDate.localeCompare(a.saleDate);
            });
            setEntries(parsed);
            if (parseErrors > 0) toast.error(`${parseErrors} arquivo(s) não puderam ser lidos.`);
          }}
        />
      </label>

      <AlertDialog open={confirmDialog !== null}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Substituir dados?</AlertDialogTitle>
            <AlertDialogDescription>
              Data {fmtBRShort(confirmDialog?.date)} já foi importada com {fmtInt(confirmDialog?.rowCount ?? 0)} linhas em {confirmDialog?.importedAt ? fmtDT(confirmDialog.importedAt) : ""}. Deseja substituir?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => confirmDialog?.resolve(false)}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => confirmDialog?.resolve(true)}>Substituir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {entries.length > 0 && (
        <div className="mt-4 kpi-card">
          <div className="mb-3 flex items-center justify-between">
            <div className="text-sm font-medium">{entries.length} arquivo(s) selecionado(s)</div>
            <Button onClick={processFiles} disabled={busy}>
              {busy ? <><Loader2 className="mr-2 size-4 animate-spin" /> Importando…</> : "Iniciar importação"}
            </Button>
          </div>

          {busy && (
            <div className="mb-3 rounded-md border bg-muted/30 p-3">
              <div className="flex items-center gap-3 text-sm">
                <FileSpreadsheet className="size-4 shrink-0 text-primary" />
                <span className="truncate font-medium">{currentDate ? fmtBRShort(currentDate) : ""}</span>
              </div>
              <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-all duration-300"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
              <div className="mt-2 flex flex-nowrap items-center gap-1.5 text-xs text-muted-foreground">
                <span className="flex items-center gap-1 shrink-0"><Gauge className="size-3" /> {fmtInt(speed)} Linhas/s</span>
                <span className="shrink-0">·</span>
                <span className="flex items-center gap-1 shrink-0 whitespace-nowrap"><Clock className="size-3" /> ~{eta}s</span>
              </div>
            </div>
          )}

          <ul className="space-y-2">
            {entries.map((e, i) => (
              <li
                key={`${e.saleDate}-${i}`}
                className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm ${
                  e.status === "processing" ? "bg-primary/5 ring-1 ring-primary/20" :
                  e.status === "done" ? "bg-success/10" :
                  e.status === "error" ? "bg-destructive/5" :
                  "bg-muted/40"
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
                  {e.status === "processing" ? `${fmtInt(processed)} / ${fmtInt(e.totalLines ?? 0)} linhas` : e.status === "done" ? "Concluído" : e.status === "error" && e.errorMsg ? "Erro" : "Aguardando"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-6 kpi-card">
        <div className="mb-3 flex items-center gap-2">
          <CalendarCheck className="size-4 text-primary" />
          <h2 className="font-display text-base font-semibold">Calendário de importações</h2>
        </div>
        <ImportCalendar records={dates ?? []} />
      </div>

      <div className="mt-6 kpi-card">
        <h2 className="font-display text-base font-semibold mb-3">Histórico de importações</h2>
        <div className="max-h-96 overflow-y-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="py-2">Data</th>
                <th className="py-2 text-right">Linhas</th>
                <th className="py-2 text-right">Atualizado</th>
              </tr>
            </thead>
            <tbody>
              {(dates ?? []).map((d) => (
                <tr key={d.sale_date} className="border-b border-border/60">
                  <td className="py-2 font-medium">{fmtBRShort(d.sale_date)}</td>
                  <td className="num py-2 text-right">{fmtInt(d.row_count)}</td>
                  <td className="py-2 text-right text-xs text-muted-foreground">{fmtDT(d.imported_at)}</td>
                </tr>
              ))}
              {(!dates || dates.length === 0) && (
                <tr><td colSpan={3} className="py-6 text-center text-xs text-muted-foreground">Nenhuma data importada.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
