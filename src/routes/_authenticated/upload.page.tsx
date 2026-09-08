import { useEffect, useState, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  beginImport,
  cancelImport,
  insertSalesChunk,
  finalizeImport,
  getImportHistory,
  getImportedDates,
} from "@/lib/upload.functions";
import { QUERY_STALE_CORE, QUERY_GC_REFERENCE } from "@/lib/query-config";
import { clearImportActive, getBrowserSessionStorage, markImportActive } from "@/lib/chunk-reload";
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
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Upload, CalendarCheck, CalendarRange, AlertCircle } from "lucide-react";
import { ImportCalendar } from "@/components/import-calendar";
import { UploadDropzone } from "@/components/upload-dropzone";
import { ImportProgress } from "@/components/import-progress";
import { ImportHistory } from "@/components/import-history";
import { DataCoverage } from "@/components/admin-data-coverage";
import { cn, fmtInt } from "@/lib/utils";
import type { ParsedSalesFile } from "@/lib/xlsx-parser";
import {
  IMPORT_BUSY_MESSAGE,
  IMPORT_CANCEL_FAILED_MESSAGE,
  IMPORT_CHUNK_SIZE,
  IMPORT_DATE_EXISTS_MESSAGE,
  IMPORT_MAX_ROWS,
} from "@/lib/import-config";
import { useWakeLock } from "@/hooks/use-wake-lock";

interface FileEntry {
  file: File;
  saleDate: string;
  status: "pending" | "processing" | "done" | "error";
  totalLines?: number;
  errorMsg?: string;
  parsed?: ParsedSalesFile;
}

interface ProcessingState {
  busy: boolean;
  progressPct: number;
  speed: number;
  eta: number;
  processed: number;
  currentDate: string;
}

// Extra attempts beyond the original (3 total), restarting the file from
// scratch each time. See the comment in processOne for why this isn't a
// per-chunk retry.
const MAX_FILE_RETRIES = 2;
const FILE_RETRY_DELAY_MS = 1500;

const IDLE_STATE: ProcessingState = {
  busy: false,
  progressPct: 0,
  speed: 0,
  eta: 0,
  processed: 0,
  currentDate: "",
};

export default function UploadPage() {
  const queryClient = useQueryClient();
  const getImported = useServerFn(getImportedDates);
  const getHistory = useServerFn(getImportHistory);
  const doBeginImport = useServerFn(beginImport);
  const doCancelImport = useServerFn(cancelImport);
  const doInsertChunk = useServerFn(insertSalesChunk);
  const doFinalizeImport = useServerFn(finalizeImport);
  const imported = useQuery({
    queryKey: ["imported-dates"],
    queryFn: () => getImported(),
    staleTime: QUERY_STALE_CORE,
    gcTime: QUERY_GC_REFERENCE,
  });

  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [pendingQueue, setPendingQueue] = useState<
    Array<{
      file: File;
      date: string;
      parsed: ParsedSalesFile;
    }>
  >([]);
  const [processing, setProcessing] = useState<ProcessingState>(IDLE_STATE);
  useWakeLock(processing.busy);

  const processingRef = useRef(false);
  const cancelRef = useRef(false);
  const startTimeRef = useRef(0);
  const processedTotalRef = useRef(0);

  useEffect(() => {
    // A fresh component cannot own an import from a previous page lifetime.
    clearImportActive(getBrowserSessionStorage());
  }, []);

  const handleFiles = (files: FileEntry[]) => {
    const valid: typeof pendingQueue = [];
    const newEntries: FileEntry[] = [];
    for (const entry of files) {
      if (entry.status === "error") {
        toast.error(`Erro ao ler ${entry.file.name}: ${entry.errorMsg ?? "erro desconhecido"}`);
        continue;
      }
      const parsed = entry.parsed;
      if (!parsed) continue;
      const totalLines = parsed.sales.length;
      if (totalLines > IMPORT_MAX_ROWS) {
        toast.error(
          `Arquivo excede o limite de ${fmtInt(IMPORT_MAX_ROWS)} linhas (${fmtInt(totalLines)}).`,
        );
        continue;
      }
      valid.push({ file: entry.file, date: entry.saleDate, parsed });
      newEntries.push({
        file: entry.file,
        saleDate: entry.saleDate,
        status: "pending",
        totalLines,
      });
    }
    if (valid.length > 0) {
      setPendingQueue(valid);
      setEntries((prev) => [...newEntries, ...prev]);
    }
  };

  const processOne = async (
    item: (typeof pendingQueue)[number],
    replaceExisting: boolean,
  ): Promise<void> => {
    const { date, parsed } = item;

    const update = (patch: Partial<FileEntry>) =>
      setEntries((prev) =>
        prev.map((e) =>
          e.saleDate === date && e.file.name === item.file.name ? { ...e, ...patch } : e,
        ),
      );

    setProcessing({
      busy: true,
      progressPct: 0,
      speed: 0,
      eta: 0,
      processed: 0,
      currentDate: date,
    });
    update({ status: "processing" });

    // Retry at the whole-file level, not per chunk. insertSalesChunk does a
    // plain INSERT with no duplicate protection (no ON DUPLICATE KEY, no
    // chunk-sequence column): resending just the chunk that failed risks
    // duplicating rows in staging_sales if the INSERT had already been
    // written on the server and only the response got lost on the network.
    // finalize_import aggregates via GROUP BY/SUM straight from staging, so a
    // resent chunk would inflate sales even though the final row-count guard
    // catches the mismatch. Restarting the file is safe because beginImport
    // clears stale staging after acquiring the exclusive lease.
    let lastError: unknown;
    for (let attempt = 0; attempt <= MAX_FILE_RETRIES; attempt++) {
      if (cancelRef.current) {
        update({ status: "error", errorMsg: "Cancelado" });
        return;
      }
      if (attempt > 0) {
        toast.info(`Falhou, tentando novamente (${attempt + 1}/${MAX_FILE_RETRIES + 1})… ${date}`);
        await new Promise((r) => setTimeout(r, FILE_RETRY_DELAY_MS));
        if (cancelRef.current) {
          update({ status: "error", errorMsg: "Cancelado" });
          return;
        }
      }
      let activeBatchId: string | null = null;
      try {
        const batchId = crypto.randomUUID();
        activeBatchId = batchId;
        await doBeginImport({
          data: {
            sale_date: date,
            batch_id: batchId,
            total_rows: parsed.sales.length,
            stores: parsed.stores,
            products: parsed.products,
            replace_existing: replaceExisting,
          },
        });

        const totalChunks = Math.ceil(parsed.sales.length / IMPORT_CHUNK_SIZE);
        for (let i = 0; i < totalChunks; i++) {
          if (cancelRef.current) {
            try {
              await doCancelImport({ data: { batch_id: batchId } });
            } catch {
              throw new Error(IMPORT_CANCEL_FAILED_MESSAGE);
            }
            activeBatchId = null;
            update({ status: "error", errorMsg: "Cancelado" });
            return;
          }
          const chunk = parsed.sales.slice(i * IMPORT_CHUNK_SIZE, (i + 1) * IMPORT_CHUNK_SIZE);
          await doInsertChunk({ data: { sale_date: date, batch_id: batchId, rows: chunk } });
          if (cancelRef.current) {
            try {
              await doCancelImport({ data: { batch_id: batchId } });
            } catch {
              throw new Error(IMPORT_CANCEL_FAILED_MESSAGE);
            }
            activeBatchId = null;
            update({ status: "error", errorMsg: "Cancelado" });
            return;
          }
          const processed = Math.min((i + 1) * IMPORT_CHUNK_SIZE, parsed.sales.length);
          processedTotalRef.current += chunk.length;
          const elapsed = (Date.now() - startTimeRef.current) / 1000;
          const speed = Math.round(processedTotalRef.current / elapsed);
          const remaining = (parsed.sales.length - processed) / speed;
          setProcessing((p) => ({
            ...p,
            progressPct: Math.round((processed / parsed.sales.length) * 100),
            speed,
            eta: Math.round(remaining),
            processed,
          }));
        }

        await doFinalizeImport({
          data: { sale_date: date, batch_id: batchId, row_count: parsed.sales.length },
        });
        activeBatchId = null;

        update({ status: "done", totalLines: parsed.sales.length });
        return;
      } catch (err) {
        lastError = err;
        if (activeBatchId) {
          try {
            await doCancelImport({ data: { batch_id: activeBatchId } });
            activeBatchId = null;
          } catch {
            lastError = new Error(IMPORT_CANCEL_FAILED_MESSAGE);
            break;
          }
        }
        if (cancelRef.current) {
          update({ status: "error", errorMsg: "Cancelado" });
          return;
        }
        if (
          err instanceof Error &&
          (err.message.includes(IMPORT_BUSY_MESSAGE) ||
            err.message.includes(IMPORT_DATE_EXISTS_MESSAGE))
        ) {
          break;
        }
      }
    }
    const msg = lastError instanceof Error ? lastError.message : "Erro desconhecido";
    update({ status: "error", errorMsg: msg });
    throw lastError;
  };

  const confirmImport = async () => {
    if (pendingQueue.length === 0 || processingRef.current) return;
    const importedDates = new Set((imported.data ?? []).map((record) => record.sale_date));
    const queue = pendingQueue.map((item) => ({
      item,
      replaceExisting: importedDates.has(item.date),
    }));
    setPendingQueue([]);
    processingRef.current = true;
    markImportActive(getBrowserSessionStorage());
    cancelRef.current = false;
    startTimeRef.current = Date.now();
    processedTotalRef.current = 0;
    setProcessing((p) => ({ ...p, busy: true, progressPct: 0, speed: 0, eta: 0, processed: 0 }));

    try {
      for (const queued of queue) {
        await processOne(queued.item, queued.replaceExisting);
        if (cancelRef.current) break;
      }
      if (cancelRef.current) {
        toast.info("Importação cancelada.");
      } else {
        void imported.refetch();
        void queryClient.invalidateQueries({ queryKey: ["import-history"] });
        toast.success("Importação concluída!");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro desconhecido";
      toast.error(msg);
    } finally {
      clearImportActive(getBrowserSessionStorage());
      processingRef.current = false;
      setProcessing(IDLE_STATE);
    }
  };

  const [tab, setTab] = useState<"upload" | "calendario">("upload");
  const totalPendingLines = pendingQueue.reduce((acc, p) => acc + p.parsed.sales.length, 0);
  const importedDates = new Set((imported.data ?? []).map((record) => record.sale_date));
  const hasExistingData = pendingQueue.some((p) => importedDates.has(p.date));
  const dateCounts = pendingQueue.reduce<Map<string, number>>(
    (counts, item) => counts.set(item.date, (counts.get(item.date) ?? 0) + 1),
    new Map(),
  );
  const duplicateDates = new Set(
    [...dateCounts].filter(([, count]) => count > 1).map(([date]) => date),
  );
  const hasDuplicateDates = duplicateDates.size > 0;
  const discardPendingEntries = () => {
    const files = new Set(pendingQueue.map((item) => item.file));
    setEntries((current) =>
      current.filter((entry) => entry.status !== "pending" || !files.has(entry.file)),
    );
  };

  return (
    <div>
      <header className="mb-6">
        <h1 className="font-display text-2xl sm:text-3xl font-bold flex items-center gap-2">
          <Upload className="size-7 text-primary shrink-0" /> Importar Vendas
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Faça upload de planilhas XLSX no formato GPA.
        </p>
      </header>

      <div className="mb-6 flex gap-1 rounded-lg bg-muted p-1 w-fit">
        <button
          onClick={() => setTab("upload")}
          className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            tab === "upload"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Upload className="size-4" /> Upload
        </button>
        <button
          onClick={() => setTab("calendario")}
          className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            tab === "calendario"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <CalendarCheck className="size-4" /> Calendário
        </button>
      </div>

      {tab === "upload" && (
        <div className="space-y-4">
          <UploadDropzone onFilesSelected={handleFiles} disabled={processing.busy} />
          {entries.length > 0 && (
            <ImportProgress
              entries={entries}
              busy={processing.busy}
              progressPct={processing.progressPct}
              speed={processing.speed}
              eta={processing.eta}
              processed={processing.processed}
              currentDate={processing.currentDate}
              onCancel={() => {
                cancelRef.current = true;
              }}
            />
          )}
          <ImportHistory historyFn={(query) => getHistory({ data: query })} />
        </div>
      )}

      {tab === "calendario" &&
        (imported.isPending ? (
          <div className="space-y-2">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-64 w-full" />
          </div>
        ) : imported.isError ? (
          <div className="kpi-card flex items-center gap-3 text-sm text-destructive">
            <AlertCircle className="size-5 shrink-0" />
            <span>Erro ao carregar dados: {imported.error.message}</span>
          </div>
        ) : (
          <div className="space-y-6">
            <div>
              <h2 className="font-display text-lg font-bold flex items-center gap-2 mb-3">
                <CalendarRange className="size-5 text-primary" /> Cobertura de dados
              </h2>
              <DataCoverage dates={imported.data} />
            </div>
            <ImportCalendar records={imported.data ?? []} />
          </div>
        ))}

      <AlertDialog
        open={pendingQueue.length > 0}
        onOpenChange={(o) => {
          if (!o) {
            if (!processingRef.current) discardPendingEntries();
            setPendingQueue([]);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {hasDuplicateDates ? "Datas duplicadas no lote" : "Confirmar importação"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {hasDuplicateDates
                ? "Escolha apenas um arquivo para cada data antes de continuar."
                : hasExistingData
                  ? "As datas marcadas como substituição terão seus dados anteriores integralmente trocados."
                  : `Importar ${pendingQueue.length} arquivo(s), totalizando ${fmtInt(totalPendingLines)} linhas?`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <ul className="max-h-56 space-y-2 overflow-y-auto text-sm">
            {pendingQueue.map((item, index) => {
              const duplicate = duplicateDates.has(item.date);
              const replacement = importedDates.has(item.date);
              return (
                <li
                  key={`${item.date}:${item.file.name}:${index}`}
                  className="flex items-start justify-between gap-4 rounded-md border p-3"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{item.file.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {item.date} · {fmtInt(item.parsed.sales.length)} linhas
                    </span>
                  </span>
                  <span
                    className={
                      duplicate || replacement
                        ? "shrink-0 text-xs font-medium text-destructive"
                        : "shrink-0 text-xs font-medium text-success"
                    }
                  >
                    {duplicate
                      ? "Data duplicada"
                      : replacement
                        ? "Substituição"
                        : "Nova importação"}
                  </span>
                </li>
              );
            })}
          </ul>
          <AlertDialogFooter>
            <AlertDialogCancel>{hasDuplicateDates ? "Fechar" : "Cancelar"}</AlertDialogCancel>
            {!hasDuplicateDates && (
              <AlertDialogAction
                className={cn(
                  hasExistingData &&
                    "bg-destructive text-destructive-foreground hover:bg-destructive/90",
                )}
                onClick={confirmImport}
              >
                {hasExistingData ? "Substituir dados" : "Importar"}
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
