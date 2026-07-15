import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState, useRef, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { beginImport, insertSalesChunk, finalizeImport } from "@/lib/upload.functions";
import { purgeOldAggs } from "@/lib/admin.functions";
import { getImportedDates } from "@/lib/upload.functions";
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
import { Upload, CalendarCheck } from "lucide-react";
import { ImportCalendar } from "@/components/import-calendar";
import { AdminGate } from "@/components/admin-gate";
import { UploadDropzone } from "@/components/upload-dropzone";
import { ImportProgress } from "@/components/import-progress";
import { ImportHistory } from "@/components/import-history";
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
  component: () => (
    <AdminGate>
      <UploadPage />
    </AdminGate>
  ),
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

  const { data: dates } = useQuery({
    queryKey: ["imported-dates"],
    queryFn: () => importedDates(),
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
  });

  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const busyRef = useRef(false);

  const acquireWakeLock = useRef(async () => {
    try {
      if ("wakeLock" in navigator) {
        wakeLockRef.current = await navigator.wakeLock.request("screen");
      }
    } catch {
      /* browser may deny request */
    }
  }).current;

  const releaseWakeLock = useRef(() => {
    wakeLockRef.current?.release();
    wakeLockRef.current = null;
  }).current;

  useEffect(() => {
    const handler = () => {
      if (document.visibilityState === "visible" && busyRef.current) {
        acquireWakeLock();
      }
    };
    document.addEventListener("visibilitychange", handler);
    return () => {
      document.removeEventListener("visibilitychange", handler);
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
      setEntries((prev) =>
        prev.map((e) => (e.file === entry.file ? { ...e, status: "processing" as const } : e)),
      );

      const f = entry.file;
      try {
        setProgressPct(0);
        setProcessed(0);
        const buf = await f.arrayBuffer();
        const parsed = parseAnyWorkbook(buf);

        totalLines = parsed.sales.length;
        if (totalLines > MAX_TOTAL_ROWS) {
          throw new Error(
            `Arquivo excede o limite de ${fmtInt(MAX_TOTAL_ROWS)} linhas (${fmtInt(totalLines)}).`,
          );
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

        setEntries((prev) => prev.map((e) => (e.file === entry.file ? { ...e, totalLines } : e)));

        const batchId = crypto.randomUUID();
        setProgressPct(0);
        await begin({
          data: {
            sale_date: parsed.sale_date,
            batch_id: batchId,
            total_rows: totalLines,
            stores: parsed.stores,
            products: parsed.products,
          },
        });

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
          await insertChunk({
            data: { sale_date: parsed.sale_date, batch_id: batchId, rows: chunk },
          });
          i += CHUNK_SIZE;
          done = i;
        }

        setProgressPct(100);
        await finalize({
          data: { sale_date: parsed.sale_date, batch_id: batchId, row_count: totalLines },
        });

        try {
          await purgeOldAggs();
        } catch {
          /* purge is best-effort */
        }

        r.push({
          filename: f.name,
          ok: true,
          message: `${fmtInt(totalLines)} linhas`,
          date: parsed.sale_date,
          rows: totalLines,
        });
        setEntries((prev) =>
          prev.map((e) => (e.file === entry.file ? { ...e, status: "done" as const } : e)),
        );
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Erro desconhecido";
        r.push({ filename: f.name, ok: false, message: msg });
        setEntries((prev) =>
          prev.map((e) =>
            e.file === entry.file ? { ...e, status: "error" as const, errorMsg: msg } : e,
          ),
        );
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

      <UploadDropzone onFilesSelected={setEntries} />

      <AlertDialog open={confirmDialog !== null}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Substituir dados?</AlertDialogTitle>
            <AlertDialogDescription>
              Data {fmtBRShort(confirmDialog?.date)} já foi importada com{" "}
              {fmtInt(confirmDialog?.rowCount ?? 0)} linhas em{" "}
              {confirmDialog?.importedAt ? fmtDT(confirmDialog.importedAt) : ""}. Deseja substituir?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => confirmDialog?.resolve(false)}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction onClick={() => confirmDialog?.resolve(true)}>
              Substituir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {entries.length > 0 && (
        <ImportProgress
          entries={entries}
          busy={busy}
          progressPct={progressPct}
          speed={speed}
          eta={eta}
          processed={processed}
          currentDate={currentDate}
          onProcess={processFiles}
        />
      )}

      <div className="mt-6 kpi-card">
        <div className="mb-3 flex items-center gap-2">
          <CalendarCheck className="size-4 text-primary" />
          <h2 className="font-display text-base font-semibold">Calendário de importações</h2>
        </div>
        <ImportCalendar records={dates ?? []} />
      </div>

      <ImportHistory dates={dates} />
    </div>
  );
}
